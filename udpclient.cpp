#include <iostream>
#include <cstring>      // For memset
#include <sys/socket.h> // For socket functions
#include <arpa/inet.h>  // For sockaddr_in and inet_addr
#include <unistd.h>     // For close()
#include "audio.h"

int main(){
    int port_client = 12345;
    int port_server = 5523;
    int sockfd_client;
    struct sockaddr_in server_addr;

    // Create socket
    sockfd_client = socket(AF_INET, SOCK_DGRAM, 0);
    if (sockfd_client < 0) {
        std::cerr << "Error creating client socket" << std::endl;
        return 1;
    }
    

    // Prepare server address
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(port_server);
    server_addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    socklen_t server_len = sizeof(server_addr);

    // Send message
    datagram dg;
    dg.id = 0;
    snprintf(dg.message, sizeof(dg.message), "%d", port_client);
    ssize_t sent_bytes = sendPacket(sockfd_client, dg, server_addr, server_len);

    if (sent_bytes < 0) {
        std::cerr << "Error sending message" << std::endl;
        close(sockfd_client);
        return 1;
    }

    std::cout << "Message sent to UDP server" << std::endl;

    std::vector<datagram> audioBuffer;
    std::unordered_set<int> seenDatagrams;
    size_t expected_samples = 154990600;
    WavHeader header;
    while (true) {
        datagram server_dg;
        // sockaddr_in server_addr;
        ssize_t recv_len = recvfrom(sockfd_client, &server_dg, sizeof(server_dg), 0, 
                                (struct sockaddr*)&server_addr, &server_len);
        if (recv_len < 0) {
            std::cerr << "Error receiving datagram" << std::endl;
            break;
        }
        if (recv_len >= 0 && server_dg.id % 1000 == 0) {
            std::cout << "Received datagram with id " << server_dg.id << std::endl;
        }
        // std::cout << "Received: " << server_dg.message << std::endl;
        if (seenDatagrams.find(server_dg.id) == seenDatagrams.end() && server_dg.id != -1){
            seenDatagrams.insert(server_dg.id);
            // std::cout << "Received datagram with id " << server_dg.id << std::endl;
            if (server_dg.id == 0) {
                header = server_dg.header;
            } else if (server_dg.id > 0) {
                audioBuffer.push_back(server_dg); 
            }       
        } else if (server_dg.id == -1) {
            std::vector<int> missingChunks = verifyAudioBuffer(audioBuffer, header, seenDatagrams);
            if (!missingChunks.empty()) {
                std::cerr << "Missing chunks detected" << std::endl;
                
                for (size_t i = 0; i < missingChunks.size(); i += 256) {
                    // audioStream.push_back(std::copy(missingChunks.begin() + i, std::min(missingChunks.begin() + i + 256, missingChunks.end()), new int32_t[256]));
                    datagram dg;
                    dg.id = -2;
                    snprintf(dg.message, sizeof(dg.message), "RETRY");
                    std::vector<int32_t>::iterator begin = missingChunks.begin() + i;
                    size_t chunk_size = std::min(static_cast<size_t>(256), missingChunks.size() - i);

                    std::copy(begin, missingChunks.begin() + i + chunk_size, dg.data);
                    std::fill(dg.data + chunk_size, dg.data + 256, 0);
                    // memset(dg.data + sizeof(missingChunks.data()), 0, sizeof(dg.data) - sizeof(missingChunks.data()));
                    // dg.data = reinterpret_cast<int32_t*>(missingChunks.data());
                    ssize_t sent_bytes = sendPacket(sockfd_client, dg, server_addr, server_len);
                    if (sent_bytes < 0) {
                        std::cerr << "Error sending RETRY message" << std::endl;
                        close(sockfd_client);
                        return 1;
                    }
                }

                datagram end_dg;
                end_dg.id = -3;
                snprintf(end_dg.message, sizeof(end_dg.message), "RETRY");

                std::cout << "Sending: " << end_dg.message << " " << end_dg.id << std::endl;
                // socklen_t server_len = sizeof(server_addr);
                ssize_t sent_len = sendPacket(sockfd_client, end_dg, server_addr, server_len);

                if (sent_len < 0) {
                    std::cerr << "Error sending datagram" << std::to_string(end_dg.id)<< std::endl;
                    close(sockfd_client);
                    return 1;
                }
            } else {
                // expected_samples = server_dg.header.data_size / sizeof(int32_t);
                break;
            }
        }
        
    }
    // header.data_size = audioBuffer.size() * 256 * sizeof(int32_t);
    
    std::cout << "recieved header with size " << header.data_size << std::endl;
    std::cout << "recieved buffer with size " << audioBuffer.size() << std::endl;
    std::vector<int32_t> processedAudio = processAudioBuffer(audioBuffer, header);
    if (processedAudio.size() > expected_samples) {
        std::cerr << "Warning: Expected " << expected_samples << " samples, but got " << processedAudio.size() << " samples." << std::endl;
        processedAudio.resize(expected_samples); // Pad with zeros if needed
    }
    writeFile(processedAudio, "output.wav", header);
    
    // Close socket
    // close(sockfd_client);
    return 0;
}