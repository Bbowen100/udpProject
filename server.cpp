#include "server_ws.hpp"
#include <future>
#include <pthread.h>
#include "audio.h"

using namespace SimpleWeb;
using namespace std;
using WsServer = SimpleWeb::SocketServer<SimpleWeb::WS>;

std::vector<int32_t> getAllAudio(std::ifstream& file)
{
    std::cout << "Audio processing started. Really..." << "\n";
    
    file.seekg(0, std::ios::end);
    std::streamsize size = file.tellg();
    file.seekg(0, std::ios::beg);

    std::size_t numelements = size / sizeof(int32_t);
    std::vector<int32_t> audioData(numelements);

    if ( !file.read(reinterpret_cast<char*>(audioData.data()), size) )
    {
        std::cerr << "Error reading WAV data." << "\n";
        return {};
    }

    return audioData;
}

string audioDataToString(const int32_t* audioData, size_t size = 256) {
    // Convert the integer array to a string
   string dataString;
   for (size_t i = 0; i < size; ++i) {
       dataString += std::to_string(audioData[i]);
       if (i < size - 1) {
           dataString += ",";
       }
   }
    return dataString;
}

int sendData(shared_ptr<WsServer::Connection> connection, string data){
    // std::cout << "Sending using sendPacket " << std::endl;
    connection->send(data, [](const SimpleWeb::error_code &ec) {
        if(ec) {
            std::cout << "Server: Error sending message. " <<
                // See http://www.boost.org/doc/libs/1_55_0/doc/html/boost_asio/reference.html, Error Codes for error code meanings
                "Error: " << ec << ", error message: " << ec.message() << std::endl;
        }
    std::this_thread::sleep_for(std::chrono::milliseconds(2));
  });
  return sizeof(data);
}

int sendFile(shared_ptr<WsServer::Connection> connection){
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

    std::vector<int32_t> audioData = getAllAudio(file);
    
    if (audioData.empty()) {
        std::cerr << "No audio data in file." << std::endl;
        return 1;
    }
    std::cout << "The audio data size is " << audioData.size() << std::endl;
    file.close();


    for (int i = 0; i < audioData.size(); i += 256) {
    
        int32_t chunk[256];
        size_t chunk_size = std::min(static_cast<size_t>(256), audioData.size() - i);
        std::copy(audioData.begin() + i, audioData.begin() + i + chunk_size, chunk);
        // integer array to string
        string audio_data_string = audioDataToString(chunk, chunk_size);

        ssize_t sent_len = sendData(connection, audio_data_string);

        if (sent_len < 0) {
            std::cerr << "Error sending datagram" << std::endl;
            return 1;
        }
    }

    std::cout << "Sending: -1, end of transmission" << std::endl;
    ssize_t sent_len = sendData(connection, "-1");
    if (sent_len < 0) {
        std::cerr << "Error sending datagram -1" << std::endl;
        return 1;
    }
    return 0;
}

int run_server(){
    WsServer server;
    server.config.port = 8081;

    // Example 1: echo WebSocket endpoint
    // Added debug messages for example use of the callbacks
    // Test with the following JavaScript:
    //   var ws=new WebSocket("ws://localhost:8080/echo");
    //   ws.onmessage=function(evt){console.log(evt.data);};
    //   ws.send("test");
    auto &echo = server.endpoint["^/echo/?$"];

 echo.on_message = [](shared_ptr<WsServer::Connection> connection, shared_ptr<WsServer::InMessage> in_message) {
    auto out_message = in_message->string();

    std::cout << "Server: Message received: \"" << out_message << "\" from " << connection.get() << std::endl;

    std::cout << "Server: Sending message \"" << out_message << "\" to " << connection.get() << std::endl;
 };

    // Alternatively use streams:
    // auto out_message = make_shared<WsServer::OutMessage>();
    // *out_message << in_message->string();
    // connection->send(out_message);
 

  echo.on_open = [](shared_ptr<WsServer::Connection> connection) {
    std::cout << "Server: Opened connection " << connection.get() << std::endl;
    // connection->send is an asynchronous function
    sendFile(connection);
  };

  // See RFC 6455 7.4.1. for status codes
  echo.on_close = [](shared_ptr<WsServer::Connection> connection, int status, const string & /*reason*/) {
    std::cout << "Server: Closed connection " << connection.get() << " with status code " << status << std::endl;
  };

  // Can modify handshake response headers here if needed
  echo.on_handshake = [](shared_ptr<WsServer::Connection> /*connection*/, SimpleWeb::CaseInsensitiveMultimap & /*response_header*/) {
    return SimpleWeb::StatusCode::information_switching_protocols; // Upgrade to websocket
  };

  // See http://www.boost.org/doc/libs/1_55_0/doc/html/boost_asio/reference.html, Error Codes for error code meanings
  echo.on_error = [](shared_ptr<WsServer::Connection> connection, const SimpleWeb::error_code &ec) {
    std::cout << "Server: Error in connection " << connection.get() << ". "
         << "Error: " << ec << ", error message: " << ec.message() << std::endl;
  };

  // Start server and receive assigned port when server is listening for requests
  promise<unsigned short> server_port;
  thread server_thread([&server, &server_port]() {
    // Start server
    try {
        server.start([&server_port](unsigned short port) {
            server_port.set_value(port);
        });
    } catch (const std::exception& e) {
        std::cerr << "Exception in server thread: " << e.what() << std::endl;
    } catch (...) {
        std::cerr << "Unknown exception in server thread." << std::endl;
    }
  });
  std::cout << "Server listening on port " << server_port.get_future().get() << std::endl
       << std::endl;

    server_thread.join();
    
  return 0;
}

int main() {
    std::cout << "Starting WebSocket server..." << std::endl;
    // WebSocketServer server;

    // WebSocket (WS)-server at port 8080 using 1 thread
      
    run_server();
    
    return 0;
}