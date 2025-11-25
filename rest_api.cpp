#include "tinyapi.h"
#include "rest_helper.cpp"
#include <csignal>

std::tuple<std::string, std::string> getstats(RequestContext request_context) {
  // you can access the exact endpoint inside your defined method using the
  int curr_connections = getActiveConnections();
  int total_connections_opened = getTotalConnectionsOpened();
  int total_connections_closed = getTotalConnectionsClosed();
  long last_broadcast_turn_around_time = getLastBroadcastTurnAroundTime();
  double average_broadcast_turn_around_time = getAverageBroadcastTurnAroundTime();
  double last_cpu_utilization_during_broadcast = getLastCpuUtilizationDuringBroadcast();
  double average_cpu_utilization_during_broadcast = getAverageCpuUtilizationDuringBroadcast();
  double last_memory_utilization_during_broadcast = getLastMemoryUtilizationDuringBroadcast();
  long total_messages_recieved = getTotalMessagesRecieved();
  long total_messages_sent = getTotalMessagesSent();
  long total_bytes_sent = getTotalBytesSent();
  long total_bytes_recieved = getTotalBytesRecieved();
  int total_threads_created = getTotalThreadsCreated();
  int current_number_of_threads = getCurrentNumberOfThreads();

  // Construct the response string
  std::string response = "";
  response += "Current Connections: " + std::to_string(curr_connections) + "\n";
  response += "Total Connections Opened: " + std::to_string(total_connections_opened) + "\n";
  response += "Total Connections Closed: " + std::to_string(total_connections_closed) + "\n";
  response += "Last Broadcast Turn Around Time: " + std::to_string(last_broadcast_turn_around_time) + "us\n";
  response += "Average Broadcast Turn Around Time: " + std::to_string(average_broadcast_turn_around_time) + "us\n";
  response += "Last CPU Utilization During Broadcast: " + std::to_string(last_cpu_utilization_during_broadcast) + "%\n";
  response += "Average CPU Utilization During Broadcast: " + std::to_string(average_cpu_utilization_during_broadcast) + "%\n";
  response += "Last Memory Utilization During Broadcast: " + std::to_string(last_memory_utilization_during_broadcast) + "MB\n";
  response += "Total Messages Recieved: " + std::to_string(total_messages_recieved) + "\n";
  response += "Total Messages Sent: " + std::to_string(total_messages_sent) + "\n";
  response += "Total Bytes Sent: " + std::to_string(total_bytes_sent) + " bytes\n";
  response += "Total Bytes Recieved: " + std::to_string(total_bytes_recieved) + " bytes\n";
  response += "Total Threads Created: " + std::to_string(total_threads_created) + "\n";
  response += "Current Number of Threads: " + std::to_string(current_number_of_threads) + "\n";



//   create a std::tuple<std::string, std::string> and return it
    std::tuple<std::string, std::string> result(response, "text/html");
  return result;
}

int initTinyAPI() {
  // Quickly setting up a basic (HTTP/1.1) REST Api at device's localhost
  const int TinyAPIPort = 8000;
  std::cout << "Initializing TinyAPI on port " << TinyAPIPort << std::endl;
  std::string localhost = "127.0.0.1";
  size_t timeout = 1450000; // 14.5s
  TinyAPI *new_api =
      new TinyAPI(TinyAPIPort, 1024, 5, localhost, timeout);
  if (new_api->initialize_server() == 1) {
    return 1;
  }

  // Easy Routing
  new_api->getMethods["/"] = getstats;

  // Start the server
  new_api->enable_listener();

  // Delete the instance for cleanup
  std::signal(SIGINT, [](int signum) {

    // exit program
      std::cout << "Interrupt signal (" << signum << ") received. Exiting..." << std::endl;
      exit(signum);
    });
  delete new_api;
  return 0;
}