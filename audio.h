using namespace std;
#include <iostream>
#include <vector>
#include <fstream>
#include <portaudio.h>
#include <unordered_set>
#include <algorithm> // for std::sort
#include <chrono>
#include <thread>
#include "dgram.h"

std::ifstream getFile(){
    std::ifstream file("SampleWav.wav", std::ios::binary);
    if (!file || !file.is_open()) {
        std::cerr << "Error opening WAV file." << "\n";
        return {};
    }
    return file;
}

WavHeader getHeader(std::ifstream& file){
    WavHeader header;

    if (!file || !file.is_open()) {
        std::cerr << "Error opening WAV file." << "\n";
        return header;
    }

    file.read(reinterpret_cast<char*>(&header), sizeof(WavHeader));
    
    if (std::string(header.riff, sizeof(header.riff)) != "RIFF" || std::string(header.wave, sizeof(header.wave)) != "WAVE") {
        std::cerr << "Invalid WAV file format." << "\n";
        return header;
    }

    return header;
}

std::vector<int32_t> getAudio(WavHeader header, std::ifstream& file)
{
    std::cout << "Audio processing started. Really..." << "\n";
    
    file.seekg(0, std::ios::end);
    std::streamsize size = file.tellg() - static_cast<std::streamsize>(sizeof(WavHeader));
    file.seekg(sizeof(WavHeader), std::ios::beg);

    std::size_t numelements = size / sizeof(int32_t);
    std::vector<int32_t> audioData(numelements);

    if ( !file.read(reinterpret_cast<char*>(audioData.data()), size) )
    {
        std::cerr << "Error reading WAV data." << "\n";
        return {};
    }

    return audioData;
}

std::vector<int32_t*> getAudioStream(std::vector<int32_t> audio)
{
    std::vector<int32_t*> audioStream;
    for (size_t offset = 0; offset < audio.size(); offset += 256) {
        int32_t* chunk = new int32_t[256];
        size_t chunk_size = std::min(static_cast<size_t>(256), audio.size() - offset);
        std::copy(audio.begin() + offset, audio.begin() + offset + chunk_size, chunk);
        
        if(chunk_size < 256) {
            std::cout << "Last chunk size: " << audio.size() - offset << std::endl;
            std::fill(chunk + chunk_size, chunk + 256, 0); // null terminate the last chunk if it's less than 256
        }
        audioStream.push_back(chunk);
    }
    return audioStream;
}

std::vector<int> verifyAudioBuffer(std::vector<datagram>& audioBuffer, WavHeader header, std::unordered_set<int>& seenDatagrams){
    std::vector<int> retryIds;
    std::vector<int> bufferIds;
    if (audioBuffer.empty() || header.data_size == 0) {
        std::cerr << "Audio buffer is empty OR header is invalid." << std::endl;
        return {};
    }
    bufferIds = std::vector<int>(seenDatagrams.begin(), seenDatagrams.end());
    std::sort(bufferIds.begin(), bufferIds.end());
    int missingCount = 0;
    for (int i = 1; i < bufferIds.size(); i++) {
        if(bufferIds[i] == bufferIds[i - 1]){
            // handle the case where the chunk is duplicate
            std::cerr << "Duplicate chunk ID: " << bufferIds[i] << std::endl;
        }
        if (bufferIds[i] != bufferIds[i - 1]+1) {
            // handle the missing buffer ID as needed
            missingCount += (bufferIds[i] - bufferIds[i - 1] - 1);
            std::cout << "Buffer ID missing between " << bufferIds[i - 1] << " and " << bufferIds[i] << " Total " << missingCount << std::endl;
            for (int id = bufferIds[i - 1]+1; id < bufferIds[i]; id++) {
                // std::cerr << "Missing chunk ID: " << id << std::endl;
                retryIds.push_back(id);
            }
       }
    }
    return retryIds;
}

std::vector<int32_t> processAudioBuffer(std::vector<datagram> audioBuffer, WavHeader header)
{
    if (header.data_size == 0 || audioBuffer.empty()) {
        std::cerr << "No audio data to process." << std::endl;
        return {};
    }
    std::cout << "Processing audio buffer with " << audioBuffer.size() << " packets." << std::endl;
    // sort the audioBuffer by datagram id
    std::sort(audioBuffer.begin(), audioBuffer.end(), [](const datagram& a, const datagram& b) {
        return a.id < b.id;
    });
    std::vector<int32_t> processedAudio;
    for (const auto& packet : audioBuffer) {
        // Process each packet (for now, just copy it)
        processedAudio.insert(processedAudio.end(), packet.data, packet.data + 256);
    }
    return processedAudio;
}

void writeFile(const std::vector<int32_t>& audioData, const std::string& filename, WavHeader header)
{
    std::ofstream file(filename, std::ios::binary | std::ios::trunc);
    if (!file) {
        std::cerr << "Error opening output file." << "\n";
    }

    std::cout << "WAV file information:" << "\n";
    std::cout << "  Format: " << header.riff << "\n";
    std::cout << "  Channels: " << header.num_channels << "\n";
    std::cout << "  Sample Rate: " << header.sample_rate << "\n";
    std::cout << "  Bits per Sample: " << header.bits_per_sample << "\n";
    std::cout << "  Data Size: " << header.data_size << "\n";

    std::cout << "Writing to data with size: " << audioData.size() << " \n";

    file.write(reinterpret_cast<const char*>(&header), sizeof(WavHeader));
    file.write(reinterpret_cast<const char*>(audioData.data()), audioData.size() * sizeof(int32_t));
    file.close();
    
}

int sendAck(int sockfd, sockaddr_in &client_addr, socklen_t &client_len){
    const char *ackMessage = "ACK";
    ssize_t sent_len = sendto(sockfd, ackMessage, strlen(ackMessage), 0, (struct sockaddr*)&client_addr, client_len);
    if (sent_len < 0) {
        std::cerr << "Error sending ACK" << std::endl;
        return 1;
    }
    std::cout << "ACK sent to client." << std::endl;
    return 0;
}

int sendPacket(int sockfd, datagram dg, sockaddr_in sendto_addr, socklen_t &sendto_len){
    // std::cout << "Sending using sendPacket " << std::endl;
    ssize_t sent_len = sendto(sockfd, &dg, sizeof(dg), 0, (struct sockaddr*)&sendto_addr, sendto_len);
    if (sent_len < 0) {
        std::cerr << "Error sending datagram" << std::to_string(dg.id)<< std::endl;
        return 1;
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(2));
    return sent_len;
}

int _main()
{
    std::ifstream file = getFile();
    if(file.peek() == std::ifstream::traits_type::eof()) {
        std::cerr << "WAV file is empty." << "\n";
        return 1;
    }
    WavHeader header = getHeader(file);

    std::cout << "WAV file information:" << "\n";
    std::cout << "  Format: " << header.riff << "\n";
    std::cout << "  Channels: " << header.num_channels << "\n";
    std::cout << "  Sample Rate: " << header.sample_rate << "\n";
    std::cout << "  Bits per Sample: " << header.bits_per_sample << "\n";
    std::cout << "  Data Size: " << header.data_size << "\n";


    std::vector<int32_t> audioData = getAudio(header, file);
    
    if (audioData.empty()) {
        std::cerr << "No audio data to play." << std::endl;
        return 1;
    }
    // for(size_t i = 0; i < 20 && i < audioData.size(); i++){
    //     std::cout << audioData[i] << " ";
    // }
    file.close();

    std::vector<int32_t*> audioStream = getAudioStream(audioData);
    for (const auto& chunk : audioStream) {
        std::cout << *chunk << std::endl;
    }
    return 0;
}