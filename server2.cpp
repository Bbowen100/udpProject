#include <future>
#include <pthread.h>
#include <iostream>
#include <fstream>
#include <set>
#include "server_ws.hpp"
#include "audio.h"

using namespace SimpleWeb;
using namespace std;
using WsServer = SimpleWeb::SocketServer<SimpleWeb::WS>;

std::string outputFile = "hls_files/SampleWav1/stream_output.m3u8"; // Output directory for HLS files
// create a set to keep track of seen files
std::set<std::string> files_seen;

int updateFile(const std::string& context){
  std::cout << context << std::endl;
  std::string initFile = "hls_files/SampleWav1/output.m3u8"; // Input WAV file
  std::string updateFile = "hls_files/SampleWav2/output.m3u8"; // Output directory for HLS files
  std::ofstream outputFileStreamOut(outputFile, std::ios::app);
  if (!outputFileStreamOut || !outputFileStreamOut.is_open()) {
        std::cerr << "Error opening WAV file." << "\n";
        return 1;
  }

  std::ifstream outputFileStreamIn(outputFile);
  if (!outputFileStreamIn || !outputFileStreamIn.is_open()) {
        std::cerr << "Error opening WAV file." << "\n";
        return 1;
  }
  // if the file is empty
  if(outputFileStreamIn.peek() == std::ifstream::traits_type::eof() and context == "initial update") {
        std::ifstream initFileStream(initFile);
        if (!initFileStream || !initFileStream.is_open()) {
            std::cerr << "Error opening initial WAV file." << "\n";
            return 1;
        }
        // copy contents of the initFile to the outputFile
        outputFileStreamOut << initFileStream.rdbuf();
        initFileStream.close();
    }
  else if(context == "calling update after sleep") {
        std::cout << "File is not empty" << std::endl;
        std::ifstream updateFileStream(updateFile);
        
        std::string line1;
        std::string line2;
        int linecount = 1;
        // read line from iftream and write to ofstream

        while (std::getline(updateFileStream, line1)) {
          if (linecount > 4){
            std::cout << "the new line is "<< line1 << std::endl;
            // regex on string to see if it matches the pattern of a .ts file
            std::regex ts_regex(".*\\.ts");
            // regex starts with #EXTINF
            std::regex extinf_regex("#EXTINF:.*");
            if (std::regex_match(line1, extinf_regex)) {
              std::getline(updateFileStream, line2);
              // if it matches, check if it is in the set
              if (std::regex_match(line2, ts_regex) && files_seen.find(line2) == files_seen.end()) {
                // If the file has not been seen, add it to the set and write to output
                  outputFileStreamOut << line1 << "\n";
                  outputFileStreamOut << line2 << "\n";
                  files_seen.insert(line2);
                  linecount+=2;
                }
                
              else if(std::regex_match(line2, ts_regex)) {
                  std::cout << "File already seen: " << line2 << std::endl;
                  return 0; // exit the loop if a duplicate is found
              }
               
            } else {
              outputFileStreamOut << line1 << "\n";
              linecount++;
            }
          } else {
            linecount++;
          }
        }
        updateFileStream.close();
    }
  outputFileStreamIn.close();
  outputFileStreamOut.close();
  return 0;
}

int sendData(shared_ptr<WsServer::Connection> connection, string data){
    // std::cout << "Sending using sendPacket " << std::endl;
    connection->send(data, [](const SimpleWeb::error_code &ec) {
        if(ec) {
            std::cout << "Server: Error sending message. " <<
                // See http://www.boost.org/doc/libs/1_55_0/doc/html/boost_asio/reference.html, Error Codes for error code meanings
                "Error: " << ec << ", error message: " << ec.message() << std::endl;
        }
  });
  return sizeof(data);
}

int sendFile(shared_ptr<WsServer::Connection> connection){
    std::string filepaths[1] = {"http://127.0.0.1:5500/hls_files/SampleWav1/stream_output.m3u8"};

    for (const auto& filepath : filepaths) {
        ssize_t sent_len = sendData(connection, filepath);
    

        if (sent_len < 0) {
            std::cerr << "Error sending datagram" << std::endl;
            return 1;
        }
        // std::this_thread::sleep_for(std::chrono::milliseconds(30000));
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
    std::string out_message = in_message->string();
    // use std::string compare to compare the strings
    if (out_message == "REQUEST_HLS_URL") {
      std::cout << "Server: Message received: \"" << out_message << "\" from " << connection.get() << std::endl;
      updateFile("initial update"); // init update the audio file to be sent
      sendFile(connection);
      // add thread that waits 30s then calls updateFile
      std::thread([]() {
          std::cout << "Starting thread to update file in 30 seconds" << std::endl;
          
          std::this_thread::sleep_for(std::chrono::seconds(10));
          updateFile("calling update after sleep"); // update the audio file to be sent       
      }).detach();
    }
    
 };

    // Alternatively use streams:
    // auto out_message = make_shared<WsServer::OutMessage>();
    // *out_message << in_message->string();
    // connection->send(out_message);
 

  echo.on_open = [](shared_ptr<WsServer::Connection> connection) {
    std::cout << "Server: Opened connection " << connection.get() << std::endl;
    // connection->send is an asynchronous function
    sendData(connection, "SOCKET_OPEN");
  };

  // See RFC 6455 7.4.1. for status codes
  echo.on_close = [](shared_ptr<WsServer::Connection> connection, int status, const string & reason) {
    std::cout << "Server: Closed connection " << connection.get() << " with status code " << status << " and reason: " << reason << std::endl;
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
    // delete contents of a stream_output.m3u8
    std::ofstream stream_output(outputFile);
    stream_output << "";
    stream_output.close();

    return 0;
}