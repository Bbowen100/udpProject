#include <string>

struct WavHeader {
    char riff[4];        // "RIFF"
    int overall_size;    // File size - 8
    char wave[4];        // "WAVE"
    char fmt[4];         // "fmt "
    int fmt_size;        // Format chunk size
    short audio_format;  // Audio format (1 = PCM)
    short num_channels;  // Number of channels
    int sample_rate;     // Sample rate
    int byte_rate;       // Byte rate
    short block_align;   // Block align
    short bits_per_sample;// Bits per sample
    char data[4];        // "data"
    int data_size;       // Data size
};

struct datagram {
    int id;
    char message[256];
    int32_t data[256];
    WavHeader header;
};