#include <iostream>
#include <cstring>      // For memset
#include <sys/socket.h> // For socket functions
#include <arpa/inet.h>  // For sockaddr_in and inet_addr
#include <unistd.h>     // For close()
#include <algorithm>
#include "audio.h"

int sendFile( std::vector<int32_t*> &audioStream, int sockfd, sockaddr_in &client_addr, socklen_t &client_len){
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
        std::cerr << "No audio data in file." << std::endl;
        return 1;
    }
    std::cout << "The audio data size is" << audioData.size() << std::endl;
    file.close();
    int defcount = 0;
    for(size_t i = 0; i < audioData.size(); i++){
        if (audioData[i] != 0) {
            defcount++;
        }
    }
    std::cout << "Number of non-zero samples: " << defcount << " % " << static_cast<float>(defcount) / audioData.size() * 100 << std::endl;
    std::cout << std::endl;
    audioStream = getAudioStream(audioData);
    std::cout << "The audio stream size is" << audioStream.size() << std::endl;

    for (int i = 0; i < audioStream.size(); i++) {
        datagram dg;
        dg.id = i;
        snprintf(dg.message, sizeof(dg.message), "Hello from datagram %d", i);
        
        dg.header = header;
    
        if (audioStream[i] != nullptr) {
            memcpy(dg.data, audioStream[i], 256 * sizeof(int32_t));
        } else {
            std::cerr << "Warning: Audio chunk " << i << " is null" << std::endl;
            return 1;
        }

        ssize_t sent_len = sendPacket(sockfd, dg, client_addr, client_len);
        
        if (sent_len < 0) {
            std::cerr << "Error sending datagram" << std::to_string(dg.id)<< std::endl;
            return 1;
        }
    }
    datagram dg;
    dg.id = -1;
    // dg.header.data_size = audioData.size();
    snprintf(dg.message, sizeof(dg.message), "Hello from datagram %d", dg.id);
    
    std::cout << "Sending: " << dg.message << std::endl;
    ssize_t sent_len = sendPacket(sockfd, dg, client_addr, client_len);
    if (sent_len < 0) {
        std::cerr << "Error sending datagram" << std::to_string(dg.id)<< std::endl;
        return 1;
    }
    return 0;
}

int sendRetry(datagram &client_dg, std::vector<int32_t*> &audioStream, int sockfd, sockaddr_in &client_addr, socklen_t &client_len, std::vector<int32_t> &chunks_to_resend, datagram &reply){
    if (client_dg.id == -2){
        // add chunk id to a buffer of chunk ids
        for (int32_t chunk : client_dg.data) {
            if (chunk < 0 || chunk >= audioStream.size()){
                std::cout << "INVALID CHUNK: " << chunk << std::endl;
            } // end of valid chunk ids

            chunks_to_resend.push_back(chunk);
            
        }
        std::cout << "num chunks to resend: " << chunks_to_resend.size() << std::endl;
    }else if (client_dg.id == -3){
        // resend all chunks
        std::cout << "Resending missing chunks..." << std::endl;
        for (int32_t chunk : chunks_to_resend) {
            reply.id = chunk;
            memcpy(reply.data, audioStream[chunk], 256 * sizeof(int32_t));
            ssize_t sent_len = sendPacket(sockfd, reply, client_addr, client_len);
            if (sent_len < 0) {
                std::cerr << "Error sending datagram" << std::to_string(reply.id)<< std::endl;
            }
            
        }
        chunks_to_resend.clear();
        // send end of retry message
        std::cout << "Sending end of retry." << std::endl;

        datagram dg;
        dg.id = -1;
        snprintf(dg.message, sizeof(dg.message), "Hello from datagram %d", dg.id);
        
        std::cout << "Sending: " << dg.message << std::endl;
        ssize_t sent_len = sendPacket(sockfd, dg, client_addr, client_len);
        if (sent_len < 0) {
            std::cerr << "Error sending datagram" << std::to_string(dg.id)<< std::endl;
        }    

    }
    return 0;
}

int main(){
    std::cout << "Hello, UDP!" << std::endl;

    //open port 5523 for communication
    int port = 5523;
    // bind socket to port
    int sockfd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sockfd < 0) {
        std::cerr << "Error creating socket" << std::endl;
        return 1;
    }

    sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    // server_addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    inet_pton(AF_INET, "127.0.0.1", &server_addr.sin_addr);
    server_addr.sin_port = htons(port);

    if (bind(sockfd, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        std::cerr << "Error binding socket to port " << port << std::endl;
        close(sockfd);
        return 1;
    }

    std::cout << "Socket bound to fd " << sockfd << ". Waiting for connection..." << std::endl;

    datagram dg;
    datagram client_dg;
    std::vector<int32_t*> audioStream;
    sockaddr_in client_addr;
    socklen_t client_len = sizeof(client_addr);
    datagram reply;
    std::vector<int32_t> chunks_to_resend;
    // listen for incoming datagrams
    while (true) {

        ssize_t recv_len = recvfrom(sockfd, &client_dg, sizeof(client_dg), 0, (struct sockaddr*)&client_addr, &client_len);
        std::cout << "Received datagram with id " << client_dg.id << std::endl;
        if (recv_len < 0) {
            std::cerr << "Error receiving datagram" << std::endl;
            continue;
        } else {
            std::cout << "Received: " << client_dg.message << std::endl;
            if (client_dg.id >= 0 && audioStream.empty()) {
                // resend the requested chunk
                sendFile(audioStream, sockfd, client_addr, client_len);
            }else if (client_dg.id < 0 && !audioStream.empty()) {
                
                sendRetry(client_dg, audioStream, sockfd, client_addr, client_len, chunks_to_resend, reply);
            }
            else {
                std::cerr << "Invalid datagram ID or audio stream not initialized." << client_dg.id << " " << client_dg.message << std::endl;
                // break;
                // return 1;
            }
        
        }
    }
    // for(int32_t* chunk : audioStream) {
    //     delete[] chunk;
    // }
    // close(sockfd);
    return 0;
}
