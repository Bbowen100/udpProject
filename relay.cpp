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

static std::mutex connections_mtx;
static std::set<std::shared_ptr<WsServer::Connection>> connections;

int sendData(shared_ptr<WsServer::Connection> connection, string data){
    std::cout << "Sending using sendPacket " << std::endl;
    // connection->send is an asynchronous function
    connection->send(data, [](const SimpleWeb::error_code &ec) {
        if(ec) {
            std::cout << "Server: Error sending message. " <<
                // See http://www.boost.org/doc/libs/1_55_0/doc/html/boost_asio/reference.html, Error Codes for error code meanings
                "Error: " << ec << ", error message: " << ec.message() << std::endl;
        }
  });
  return sizeof(data);
}

void broadcast(const std::string& msg, shared_ptr<WsServer::Connection> curr_connection, bool include_self = false) {
    std::vector<std::shared_ptr<WsServer::Connection>> conn_pool;
    {
        std::lock_guard<std::mutex> lock(connections_mtx);
        conn_pool.assign(connections.begin(), connections.end());
    }
    for (auto &conn : conn_pool) {
      if (!include_self && conn == curr_connection) {
          continue;
      }else{
          sendData(conn, msg);
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
    std::string out_message = in_message->string();
    cout << "Server: Message received from " << connection.get() << std::endl;
    broadcast(out_message, connection);
    // sendData(connection, "SOCKET_OPEN");
    
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
    }
    
    sendData(connection, "SOCKET_OPEN");
  };

  // See RFC 6455 7.4.1. for status codes
  echo.on_close = [](shared_ptr<WsServer::Connection> connection, int status, const string & reason) {
    std::cout << "Server: Closed connection " << connection.get() << " with status code " << status << " and reason: " << reason << std::endl;
    {
        std::lock_guard<std::mutex> lock(connections_mtx);
        connections.erase(connection);
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
      
    run_server();

    return 0;
}