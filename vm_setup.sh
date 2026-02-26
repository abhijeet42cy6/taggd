#!/bin/bash
set -e
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get update && sudo apt-get install -y docker-compose-plugin git

# Allow current user to run docker
sudo usermod -aG docker $USER
