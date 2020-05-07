#/usr/bin/env bash

read -p "Plex username: " USERNAME
read -p "Plex password: " -s PASSWORD

echo ""
echo -n "Getting token from Plex..."

TOKEN=$(curl -s -H 'X-Plex-Client-Identifier: plex-cluster' --data "user[login]=${USERNAME}" --data "user[password]=${PASSWORD}" 'https://plex.tv/users/sign_in.xml' \
    | grep "<authentication-token>" \
    | sed 's/<authentication-token>//g;s/<\/authentication-token>//g')

echo ""
TOKEN=$(echo ${TOKEN})
echo "Your Plex token is: ${TOKEN}"