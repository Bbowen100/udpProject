
#include <set>
#include <mutex>
#include "server_ws.hpp"
#include <sys/resource.h>

struct BinaryDataQueueItem {
    std::shared_ptr<SimpleWeb::SocketServer<SimpleWeb::WS>::OutMessage> data;
    std::shared_ptr<SimpleWeb::SocketServer<SimpleWeb::WS>::Connection> connection;
    bool include_self;
    unsigned char opcode;
};

extern std::mutex connections_mtx;
extern std::set<std::shared_ptr<SimpleWeb::SocketServer<SimpleWeb::WS>::Connection>> connections;

extern std::mutex connections_open_mtx;
extern int connections_open;

extern std::mutex connections_closed_mtx;
extern int connections_closed;

extern std::mutex last_broadcast_turn_around_time_mtx;
extern long last_broadcast_turn_around_time;

extern std::mutex total_broadcast_turn_around_time_mtx;
extern long total_broadcast_turn_around_time;

extern std::mutex count_broadcast_turn_around_time_mtx;
extern long count_broadcast_turn_around_time;

extern std::mutex average_broadcast_turn_around_time_mtx;
extern double average_broadcast_turn_around_time;

extern std::mutex last_cpu_utilization_during_broadcast_mtx;
extern double last_cpu_utilization_during_broadcast;

extern std::mutex average_cpu_utilization_during_broadcast_mtx;
extern double average_cpu_utilization_during_broadcast;

extern std::mutex last_memory_utilization_during_broadcast_mtx;
extern double last_memory_utilization_during_broadcast;

extern std::mutex average_memory_utilization_during_broadcast_mtx;
extern double average_memory_utilization_during_broadcast;

extern std::mutex total_messages_recieved_mtx;
extern long total_messages_recieved;

extern std::mutex total_messages_sent_mtx;
extern long total_messages_sent;

extern std::mutex total_bytes_sent_mtx;
extern long total_bytes_sent;

extern std::mutex total_bytes_recieved_mtx;
extern long total_bytes_recieved;

extern std::mutex total_threads_created_mtx;
extern int total_threads_created;

extern std::mutex current_number_of_threads_mtx;
extern int current_number_of_threads;


int getActiveConnections() {
    // get global variable connections, engage lock and return its size
    {
        std::lock_guard<std::mutex> lock(connections_mtx);
        return connections.size();
    }
}

int getTotalConnectionsOpened() {
    {
        std::lock_guard<std::mutex> lock(connections_open_mtx);
        return connections_open;
    }
}

int getTotalConnectionsClosed() {
    {
        std::lock_guard<std::mutex> lock(connections_closed_mtx);
        return connections_closed;
    }
}

long getLastBroadcastTurnAroundTime() {
    {
        std::lock_guard<std::mutex> lock(last_broadcast_turn_around_time_mtx);
        return last_broadcast_turn_around_time;
    }
}

double getAverageBroadcastTurnAroundTime() {
    {
        std::lock_guard<std::mutex> lock(total_broadcast_turn_around_time_mtx);
        std::lock_guard<std::mutex> lock2(count_broadcast_turn_around_time_mtx);
        if(count_broadcast_turn_around_time == 0) return 0;
        return static_cast<double>(total_broadcast_turn_around_time) / count_broadcast_turn_around_time;
    }
}

double getLastCpuUtilizationDuringBroadcast() {
    {
        std::lock_guard<std::mutex> lock(last_cpu_utilization_during_broadcast_mtx);
        return last_cpu_utilization_during_broadcast;
    }
}

double getAverageCpuUtilizationDuringBroadcast() {
    {
        std::lock_guard<std::mutex> lock(average_cpu_utilization_during_broadcast_mtx);
        return average_cpu_utilization_during_broadcast;
    }
}

double getLastMemoryUtilizationDuringBroadcast() {
    struct rusage usage;
    getrusage(RUSAGE_SELF, &usage);
    return static_cast<double>(usage.ru_maxrss)/1024; // Convert to MB
}

long getTotalMessagesRecieved() {
    {
        std::lock_guard<std::mutex> lock(total_messages_recieved_mtx);
        return total_messages_recieved;
    }
}

long getTotalMessagesSent() {
    {
        std::lock_guard<std::mutex> lock(total_messages_sent_mtx);
        return total_messages_sent;
    }
}

long getTotalBytesSent() {
    {
        std::lock_guard<std::mutex> lock(total_bytes_sent_mtx);
        return total_bytes_sent;
    }
}

long getTotalBytesRecieved() {
    {
        std::lock_guard<std::mutex> lock(total_bytes_recieved_mtx);
        return total_bytes_recieved;
    }
}

int getTotalThreadsCreated() {
    {
        std::lock_guard<std::mutex> lock(total_threads_created_mtx);
        return total_threads_created;
    }
}

int getCurrentNumberOfThreads() {
    {
        std::lock_guard<std::mutex> lock(current_number_of_threads_mtx);
        return current_number_of_threads;
    }
}
