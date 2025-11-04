#include "tinyapi.h"

std::tuple<std::string, std::string> home(RequestContext request_context) {
  // you can access the exact endpoint inside your defined method using the
  // 'url_endpoint' variable
  std::string response = "Greetings User! Welcome to TinyAPI.";
//   create a std::tuple<std::string, std::string> and return it
    std::tuple<std::string, std::string> result(response, "text/html");
  return result;
}

int initTinyAPI() {
  // Quickly setting up a basic (HTTP/1.1) REST Api at device's localhost
  std::cout << "Initializing TinyAPI..." << std::endl;
  std::string localhost = "127.0.0.1";
  size_t timeout = 1450000; // 14.5s
  TinyAPI *new_api =
      new TinyAPI(8000, 1024, 5, localhost, timeout);
  if (new_api->initialize_server() == 1) {
    return 1;
  }

  // Easy Routing
  new_api->getMethods["/home"] = home;

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