#include <pthread.h>
#include <iostream>
#include <fstream>
#include <set>
#include <mutex>

#include "server_ws.hpp"
#include "audio.h"
#include "rest_api.cpp"

using namespace SimpleWeb;
using namespace std;
using WsServer = SimpleWeb::SocketServer<SimpleWeb::WS>;

std::mutex connections_mtx;
std::set<std::shared_ptr<WsServer::Connection>> connections;

std::mutex connections_open_mtx;
int connections_open;

std::mutex connections_closed_mtx;
int connections_closed;

std::mutex last_broadcast_turn_around_time_mtx;
long last_broadcast_turn_around_time;

std::mutex total_broadcast_turn_around_time_mtx;
long total_broadcast_turn_around_time;

std::mutex count_broadcast_turn_around_time_mtx;
long count_broadcast_turn_around_time;

std::mutex last_cpu_utilization_during_broadcast_mtx;
double last_cpu_utilization_during_broadcast;

std::mutex average_cpu_utilization_during_broadcast_mtx;
double average_cpu_utilization_during_broadcast;

std::mutex last_memory_utilization_during_broadcast_mtx;
double last_memory_utilization_during_broadcast;

std::mutex average_memory_utilization_during_broadcast_mtx;
double average_memory_utilization_during_broadcast;

std::mutex total_messages_recieved_mtx;
long total_messages_recieved;

std::mutex total_messages_sent_mtx;
long total_messages_sent;

std::mutex total_bytes_sent_mtx;
long total_bytes_sent;

std::mutex total_bytes_recieved_mtx;
long total_bytes_recieved;

std::mutex total_threads_created_mtx;
int total_threads_created;

std::mutex current_number_of_threads_mtx;
int current_number_of_threads;

std::chrono::_V2::system_clock::time_point start_time;
std::chrono::_V2::system_clock::time_point end_time;


int sendData(shared_ptr<WsServer::Connection> connection, std::string data, unsigned char opcode = 129) {
    std::cout << "Sending using sendPacket " << std::endl;
    // connection->send is an asynchronous function
    auto out_message = std::make_shared<WsServer::OutMessage>();
    // out_message->write(data.c_str(), data.size());
    connection->send(out_message, [](const SimpleWeb::error_code &ec) {
        if(ec) {
            std::cout << "Server: Error sending message. " <<
                // See http://www.boost.org/doc/libs/1_55_0/doc/html/boost_asio/reference.html, Error Codes for error code meanings
                "Error: " << ec << ", error message: " << ec.message() << std::endl;
        }
  }, opcode);
  return sizeof(data);
}

int sendBinaryData(shared_ptr<WsServer::Connection> connection, std::shared_ptr<WsServer::OutMessage> &data, unsigned char opcode = 129) {
    std::cout << "Sending using sendPacket " << std::endl;
    // connection->send is an asynchronous function
    // auto out_message = std::make_shared<WsServer::OutMessage>();
    // out_message->write(data.c_str(), data.size());
    connection->send(data, [](const SimpleWeb::error_code &ec) {
        if(ec) {
            std::cout << "Server: Error sending message. " <<
                // See http://www.boost.org/doc/libs/1_55_0/doc/html/boost_asio/reference.html, Error Codes for error code meanings
                "Error: " << ec << ", error message: " << ec.message() << std::endl;
        }
  }, opcode);
  return sizeof(data);
}

void broadcast_binary(std::shared_ptr<WsServer::OutMessage> msg, shared_ptr<WsServer::Connection> curr_connection, bool include_self = false, unsigned char opcode = 129) {
    std::vector<std::shared_ptr<WsServer::Connection>> conn_pool;
    {
        std::lock_guard<std::mutex> lock(connections_mtx);
        conn_pool.assign(connections.begin(), connections.end());
    }
    for (auto &conn : conn_pool) {
      if (!include_self && conn == curr_connection) {
          continue;
      }else{
        { 
          std::lock_guard<std::mutex> lock(total_messages_sent_mtx);
          total_messages_sent++;
        }
        sendBinaryData(conn, msg, opcode);
      }
    }
    end_time = std::chrono::high_resolution_clock::now();
    {
        std::lock_guard<std::mutex> lock(last_broadcast_turn_around_time_mtx);
        last_broadcast_turn_around_time = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time).count();
        std::lock_guard<std::mutex> lock2(total_broadcast_turn_around_time_mtx);
        total_broadcast_turn_around_time += last_broadcast_turn_around_time;
        std::lock_guard<std::mutex> lock3(count_broadcast_turn_around_time_mtx);
        count_broadcast_turn_around_time++;
    }
}

void broadcast(std::string msg, shared_ptr<WsServer::Connection> curr_connection, bool include_self = false, unsigned char opcode = 129) {
    std::vector<std::shared_ptr<WsServer::Connection>> conn_pool;
    {
        std::lock_guard<std::mutex> lock(connections_mtx);
        conn_pool.assign(connections.begin(), connections.end());
    }
    for (auto &conn : conn_pool) {
      if (!include_self && conn == curr_connection) {
          continue;
      }else{
          sendData(conn, msg, opcode); 
      }
    }
     
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
    //start a timer to measure how long it takes to process the message
    start_time = std::chrono::high_resolution_clock::now();
    {
        std::lock_guard<std::mutex> lock(total_messages_recieved_mtx);
        total_messages_recieved++;
    }
    
    if ((in_message->fin_rsv_opcode & 0x0f) == 2) {
        // Close frame received, ignore the message
        // in_message->binary(); // Consume the message to clear the stream
        std::shared_ptr<WsServer::OutMessage> binary_data = std::make_shared<WsServer::OutMessage>();
        // *binary_data << in_message->string();
        // write in_message data to binary_data
        char buffer[8192];
         std::size_t bytes_read;
         std::streambuf *in_buf = in_message->rdbuf();
         while ((bytes_read = in_buf->sgetn(buffer, sizeof(buffer))) > 0) {
             binary_data->write(buffer, bytes_read);
         }
        // binary_data->write(asio::buffers_begin(in_message->rdbuf()), asio::buffers_size(in_message->rdbuf()));

        std::cout << "Server: Binary message received from " << connection.get() << ", size: " << binary_data->size() << " bytes" << std::endl;
        broadcast_binary(binary_data, connection, false, 130); // opcode 130 for binary
    }else{
      std::string out_message = in_message->string();
      cout << "Server: Message received from " << connection.get() << std::endl;
      broadcast(out_message, connection);
      // sendData(connection, "SOCKET_OPEN");
    }
    
  };

    // Alternatively use streams:
    // auto out_message = make_shared<WsServer::OutMessage>();
    // *out_message << in_message->string();
    // connection->send(out_message);
 

  echo.on_open = [](shared_ptr<WsServer::Connection> connection) {
    std::cout << "Server: Opened connection " << connection.get() << std::endl;
    
    {
        std::lock_guard<std::mutex> lock(connections_mtx);
        connections.insert(connection);
        std::lock_guard<std::mutex> lock2(connections_open_mtx);
        connections_open++;
    }
    
    sendData(connection, "SOCKET_OPEN");
  };

  // See RFC 6455 7.4.1. for status codes
  echo.on_close = [](shared_ptr<WsServer::Connection> connection, int status, const string & reason) {
    std::cout << "Server: Closed connection " << connection.get() << " with status code " << status << " and reason: " << reason << std::endl;
    {
        std::lock_guard<std::mutex> lock(connections_mtx);
        connections.erase(connection);
        std::lock_guard<std::mutex> lock3(connections_closed_mtx);
        connections_closed++;
    }
    sendData(connection, "SOCKET_CLOSED");
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

  std::cout << "Server listening on port " << server_port.get_future().get() << std::endl << std::endl;

  server_thread.join();
    
  return 0;
}

int main() {
    std::cout << "Starting WebSocket server..." << std::endl;
    // detect if interrupt signal to end program
    std::signal(SIGINT, [](int signum) {
      // exit program
      std::cout << "Interrupt signal (" << signum << ") received. Exiting..." << std::endl;
      exit(signum);
    });

    // WebSocket (WS)-server at port 8080 using 1 thread
    // Initialize TinyAPI in a different thread to avoid blocking
    std::thread tinyapi_thread(initTinyAPI);
    tinyapi_thread.detach();
    run_server();
    

    return 0;
}