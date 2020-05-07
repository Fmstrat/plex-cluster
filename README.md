# Plex Cluster
Synchronizes the watched and timeline status between any number of Plex servers all using standard Plex APIs.

Plex Cluster contains two applications:
- **Plex Cluster Proxy**, which is installed alongside every Plex server and acts as a proxy (using `nginx`) between Plex Media Server and the internet. This application's job is to pass any requests that come to it along to the Plex server while catching any requests that mark watched status and also forwarding them on the **Plex Cluster Manager**. There is one instance of `Plex Cluster Proxy` for each Plex server.
- **Plex Cluster Manager** is then used to synchronize the status between Plex servers. There is only one instance of `Plex Cluster Manager` which is used by all instances of `Plex Cluster Proxy`.

An example use case:
1. Plex client requests to watch a show with GIUD (unique identifier) `ABC` from the `TV Shows` library on `Plex Server 1`
2. The request goes through `Plex Cluster Proxy 1` and is passed along to `Plex Server 1`
3. The user stops the show midway.
4. The request goes through `Plex Cluster Proxy 1` and is passed along to `Plex Server 1`, but is also passed along to `Plex Cluster Manager`
5. `Plex Cluster Manager` takes the request and checks for any other Plex server with a library named `TV Shows` and GUID `ABC`
6. For any other servers it finds, such as `Plex Server 2`, it forwards the request on to them and the show is instantly marked as watched up to that midway point.
7. User switches over to `Plex Server 2` and sees that they are midway through show `ABC`

## Features
- Syncs watched status on-demand, right away
- Uses standard Plex APIs without accessing the database
- Can work across multiple Plex servers
- Scheduled "full update" can completely sync user's watched status for any user that has been active on each Plex server since running `Plex Cluster`
- Syncs media that is contained on both (or multiple) servers without erroring when media does not exist
- Works for Plex.tv or Managed users

## To Do
- Support "full sync" for users on some Roku models and other devices that encapsulate a temporary token in the request header (this does not impact on-demand sync)

## Requirements
- Each Plex server must have a dedicated DNS or Dynamic DNS hostname

## Installation
The best way to use `Plex Cluster` is with Docker. You can follow the `Dockerfile`s to set up the proxy manually, however if you're not running Docker for your services, you're missing out.

This installation follows this example:
- 2 Plex servers, one at home called `Home` and one remote called `Remote`
- `Home` has...
    - a public DNS record of `plex-home.mydomain.com`
    - a Plex server running on `192.168.0.10:32400`
    - a Plex Cluster Proxy instance running on `https://plex-home.mydomain.com:32401`
    - a wildcard SSL certificate for `*.mydomain.com` in the `/certs` folder
- `Remote` has...
    - a public DNS record of `plex-remote.mydomain.com`
    - a Plex server running on `192.168.1.10:32400`
    - a Plex Cluster Proxy instance running on `https://plex-remote.mydomain.com:32401`
    - a Plex Cluster Manager instance running on `https://plex-remote.mydomain.com:32402`
    - a wildcard SSL certificate for `*.mydomain.com` in the `/certs` folder

### Setting up the Home instance
First, we need a Plex server, and a copy of `Plex Cluster Proxy` running at home. These can be spun up with the following `docker-compose.yml`:

``` yml
version: '3.7'

services:

  # A proxy based on nginx that sits between the Plex server and
  # the internet. Every time a request is made to Plex, if that
  # request is to mark status, an API call is made
  # to plex-cluster-manager.
  #
  # There is one of these for every Plex server.
  plex-cluster-proxy:
    image: nowsci/plex-cluster-proxy
    container_name: plex-cluster-proxy
    environment:
      - PLEX_IP=192.168.0.10 # The IP address of the Plex server's NIC
      - PLEX_PORT=32400      # The port Plex is listening on
      - HTTPS_HOST=plex-home.mydomain.com # The host that Plex Cluster Proxy will listen on
      - HTTPS_PORT=32401                  # The port that Plex Cluster Proxy will listen on
      - RESOLVERS=8.8.4.4 8.8.8.8 # DNS servers that Plex Cluster Proxy should use
      - SSL_CERTIFICATE=/certs/fullchain.pem   # Mapped location of the below SSL cert
      - SSL_CERTIFICATE_KEY=/certs/privkey.pem # Mapped location of the below SSL cert
      - CLUSTER_MANAGER=https://plex-remote.mydomain.com:32402 # URL of Plex Cluster Manager
      - CLUSTER_MANAGER_TOKEN=JgUNaJ6DcB7FhhYGcUpaa9DwPy       # CHANGE THIS: A random token that Plex Cluster Proxy will use to authenticate with Manager
    volumes:
      - /etc/localtime:/etc/localtime:ro # Keeps time in sync
      - ./certs/fullchain.pem:/certs/fullchain.pem:ro # Mapped path to the SSL certificate
      - ./certs/privkey.pem:/certs/privkey.pem:ro     # Mapped path to the SSL certificate
      - plex-cluster-proxy:/data # Docker volume where log data is stored for processing
    ports:
      - 32401:32401 # Port mapping (same as HTTPS_PORT), forward this port on your firewall
    restart: always # Restart on failure

  # The Home Plex server
  # This assumes you have Plex Pass
  plex:
    image: plexinc/pms-docker:plexpass
    container_name: plex
    environment:
      - TZ=America/New_York
    network_mode: bridge
    ports:
      - "192.168.0.10:32400:32400/tcp" # The port and IP to listen on, do not forward this port on your firewall
    volumes:
      - ./plex/plex/config:/config # Where you want your Plex Library/Config folder to be
      - /storage/transcode/plex:/transcode # A path for transcoding
      - /storage/transcode/plex/Sync+:/config/Library/Application Support/Plex Media Server/Cache/Transcode/Sync+ # To keep sync transcoding in the transcode folder
      - /storage/transcode/plex/Sync:/config/Library/Application Support/Plex Media Server/Cache/Transcode/Sync   # To keep sync transcoding in the transcode folder
      - /storage/media:/media # Media folder
    restart: always

volumes:
  plex-cluster-proxy:    
```

After you spin this up with `docker-compose up -d`, navigate in your browser to `http://192.168.0.10:32400/web` and login to your new server. A few key things to set up are:
- Settings -> Remote Access -> Disable Remote Access (Don't worry, you'll still be able to get here through your custom URL)
- Settings -> Network -> Click Show Advanced
- Settings -> Network -> Secure connections -> Choose `Required`
- Settings -> Network -> Custom server access URLs -> Enter `https://plex-home.mydomain.com:32401`

The home server setup is complete.

### Setting up the Remote instance
Next we need a Plex server, a copy of `Plex Cluster Proxy` and a copy of `Plex Cluster Manager` running remotely. These can be spun up with the following `docker-compose.yml`:

``` yml
version: '3.7'

services:

  # A proxy based on nginx that sits between the Plex server and
  # the internet. Every time a request is made to Plex, if that
  # request is to mark status, an API call is made
  # to plex-cluster-manager.
  #
  # There is one of these for every Plex server.
  plex-cluster-proxy:
    image: nowsci/plex-cluster-proxy
    container_name: plex-cluster-proxy
    environment:
      - PLEX_IP=192.168.1.10 # The IP address of the Plex server's NIC
      - PLEX_PORT=32400      # The port Plex is listening on
      - HTTPS_HOST=plex-remote.mydomain.com # The host that Plex Cluster Proxy will listen on
      - HTTPS_PORT=32401                    # The port that Plex Cluster Proxy will listen on
      - RESOLVERS=8.8.4.4 8.8.8.8 # DNS servers that Plex Cluster Proxy should use
      - SSL_CERTIFICATE=/certs/fullchain.pem   # Mapped location of the below SSL cert
      - SSL_CERTIFICATE_KEY=/certs/privkey.pem # Mapped location of the below SSL cert
      - CLUSTER_MANAGER=http://plex-cluster-manager:32402 # URL of Plex Cluster Manager (local Docker URL in this case)
      - CLUSTER_MANAGER_TOKEN=JgUNaJ6DcB7FhhYGcUpaa9DwPy  # CHANGE THIS: A random token that Plex Cluster Proxy will use to authenticate with Manager
    volumes:
      - /etc/localtime:/etc/localtime:ro # Keeps time in sync
      - ./certs/fullchain.pem:/certs/fullchain.pem:ro # Mapped path to the SSL certificate
      - ./certs/privkey.pem:/certs/privkey.pem:ro     # Mapped path to the SSL certificate
      - plex-cluster-proxy:/data # Docker volume where log data is stored for processing
    ports:
      - 32401:32401 # Port mapping (same as HTTPS_PORT), forward this port on your firewall
    restart: always # Restart on failure

  # The service that sychronizes the Plex servers. It takes the API calls
  # from plex-cluster-proxy, and reaches out to any other configured Plex
  # servers to set their status just as if the client connecting to the
  # original Plex server was connecting to that one instead.
  #
  # You will want to secure this behind an SSL proxy in the real world.
  #
  # There is only ever one of these.
  plex-cluster-manager:
    image: nowsci/plex-cluster-manager
    container_name: plex-cluster-manager
    environment:
      - CLUSTER_MANAGER_TOKEN=JgUNaJ6DcB7FhhYGcUpaa9DwPy # CHANGE THIS: A random token that Plex Cluster Proxy will use to authenticate with Manager
      - UPDATE_ON_START=true # Do a full sync on start
      - DEBUG=false # Output debug logs
      - FULL_SYNC_SCHEDULE=0 2 * * * # A cron-styled schedule for when to run the full sync
    volumes:
      - /etc/localtime:/etc/localtime:ro # Keeps time in sync
      - ./config/plex-cluster-manager.yml:/config/plex-cluster-manager.yml:ro # A config file, see below
      - plex-cluster-manager:/data # Where Plex Cluster Manager stores it's SQLite DB
    restart: always

  # The Remote Plex server
  # This assumes you have Plex Pass
  # You could also clone the Home server and remove Preferences.xml before starting
  plex:
    image: plexinc/pms-docker:plexpass
    container_name: plex
    environment:
      - TZ=America/New_York
    network_mode: bridge
    ports:
      - "192.168.1.10:32400:32400/tcp" # The port and IP to listen on, do not forward this port on your firewall
    volumes:
      - ./plex/plex/config:/config # Where you want your Plex Library/Config folder to be
      - /storage/transcode/plex:/transcode # A path for transcoding
      - /storage/transcode/plex/Sync+:/config/Library/Application Support/Plex Media Server/Cache/Transcode/Sync+ # To keep sync transcoding in the transcode folder
      - /storage/transcode/plex/Sync:/config/Library/Application Support/Plex Media Server/Cache/Transcode/Sync   # To keep sync transcoding in the transcode folder
      - /storage/media:/media # Media folder
    restart: always

volumes:
  plex-cluster-manager:
  plex-cluster-proxy:    
```
Before starting it up, you will need to create the `plex-cluster-manager.yml` configuration file ([sample](config/plex-cluster-manager.sample.yml)). This file looks like:
``` yml
hosts:
  - host: plex.mydomain.com
    port: 11111
    token: xxxxxxxxxxxxxxxxxxxx
    #log: ./plex.log    # This is not commonly used. It is only used to tail a local log.
```
The token should be a Plex token for the administrative user on the Plex server. You can get a token from Plex using [this script](tools/get-plex-token.sh).

After you spin this up with `docker-compose up -d`, navigate in your browser to `http://192.168.1.10:32400/web` and login to your new server. A few key things to set up are:
- Settings -> Remote Access -> Disable Remote Access (Don't worry, you'll still be able to get here through your custom URL)
- Settings -> Network -> Click Show Advanced
- Settings -> Network -> Secure connections -> Choose `Required`
- Settings -> Network -> Custom server access URLs -> Enter `https://plex-remote.mydomain.com:32401`

The remote server setup is complete.

### Final steps

Once everything is complete, login via `https://plex.tv` and if you watch the logs via `docker-compose logs -ft` and mark shows watched you should start seeing `plex-cluster-proxy` and `plex-cluster-manager` scynchronize the status.