#include "server_ws.hpp"
#include <iostream>
#include <set>
#include <mutex>
#include <algorithm>

using namespace std;
using WsServer = SimpleWeb::SocketServer<SimpleWeb::WS>;

// Store connections
std::mutex connections_mtx;
std::set<std::shared_ptr<WsServer::Connection>> connections;

int main() {
    WsServer server;
    server.config.port = 8083;

    auto &endpoint = server.endpoint["^/signaling/?$"];

    endpoint.on_open = [](shared_ptr<WsServer::Connection> connection) {
        cout << "Server: Opened connection " << connection.get() << endl;
        std::lock_guard<std::mutex> lock(connections_mtx);
        connections.insert(connection);
    };

    endpoint.on_close = [](shared_ptr<WsServer::Connection> connection, int status, const string & /*reason*/) {
        cout << "Server: Closed connection " << connection.get() << " with status code " << status << endl;
        std::lock_guard<std::mutex> lock(connections_mtx);
        connections.erase(connection);
    };

    endpoint.on_error = [](shared_ptr<WsServer::Connection> connection, const SimpleWeb::error_code &ec) {
        cout << "Server: Error in connection " << connection.get() << ". "
             << "Error: " << ec << ", error message: " << ec.message() << endl;
    };

    endpoint.on_message = [](shared_ptr<WsServer::Connection> connection, shared_ptr<WsServer::InMessage> in_message) {
        // Check if binary (opcode 2) or text (opcode 1)
        auto opcode = in_message->fin_rsv_opcode & 0x0f;
        
        // Read the message content
        auto out_message = make_shared<WsServer::OutMessage>();
        *out_message << in_message->string();
        
        // Broadcast to all other connections
        std::lock_guard<std::mutex> lock(connections_mtx);
        for(auto &a_connection : connections) {
            if(a_connection != connection) {
                // Send with the same opcode (129 for text, 130 for binary if FIN bit is set)
                // SimpleWeb::WS::Connection::send takes opcode as 3rd arg.
                // 129 = 0x81 (FIN + Text), 130 = 0x82 (FIN + Binary)
                unsigned char send_opcode = (opcode == 2) ? 130 : 129;
                
                a_connection->send(out_message, [](const SimpleWeb::error_code &ec) {
                    if(ec) {
                        cout << "Server: Error sending message. " <<
                            "Error: " << ec << ", error message: " << ec.message() << endl;
                    }
                }, send_opcode);
            }
        }
    };

    cout << "Starting WebSocket Audio Relay Server on port 8083..." << endl;
    
    thread server_thread([&server]() {
        server.start();
    });

    server_thread.join();

    return 0;
}
