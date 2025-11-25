#!/bin/bash
cd $(dirname "$0")
./coturn/bin/turnserver -c coturn.conf
