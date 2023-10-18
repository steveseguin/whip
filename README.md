# WHIP server code for VDO.Ninja
A VDO.Ninja-specific WHIP/WHEP API and integration wrapper

There are multiple goals of this project:
- to allow for self-hosting of the WHIP/WHEP service used by VDO.Ninja
- to be a universally compatible WHIP/WHEP endpoint that's up to full spec. (WIP)
- To allow VDO.Ninja users to use their own WHIP/WHEP service in place of Meshcast.io (WIP)
- Potentially also offer easy integration support for popular SFU servers and services, such as Cloudflare/PION

This script is NOT an SFU server, and so it requires an active viewer connected and waiting for incoming WHIP streams to successfully publish. Some WHIP publishing apps might not support STUN / TURN / NAT traversial, if the viewer is behind a NAT-enabled firewall, such as is common with consumer routers, things may still fail.

This script  is written in Node.js, as to be accessible to all-levels of developers; it can be self-hosted or migrated to use with popular cloud worker services. That said, it may still be moderately challenging to deploy this code correctly.

This code (or a variant) is hosted as a service whip.vdo.ninja, which is what VDO.Ninja uses by default.

### Prerequisites for a server deployment

1. **Download:** Assuming you aren't using a cloud worker, download/copy the whip.js code to your server

2. **Node.js:** Ensure that you have Node.js installed on your system. You can download it from the [official website](https://nodejs.org/).

3. **Dependencies:** Install any additional dependencies your project requires, such as by doing `npm install express` and `npm install ws`, etc.

4. **SSL Certificates (if needed):** If you're not using a Content Delivery Network (CDN) that offers SSL+Websocket proxying (ie: Cloudflare), you may need to set up and add SSL support locally (ie: using `certbot`).

WebRTC generally requires a valid SSL connection, so please get this step correct; it's almost always where the problem occurs. You may need a domain name also to provide SSL support. If you are using Cloudflare, you may need to set its SSL mode to "flexible" to allow your server to run without SSL, otherwise you will still need to install a certificate locally.

5. **TURN Servers (if needed):** Please do not use the VDO.Ninja TURN servers with your independent projects. Deploy your own TURN servers if needed; you are currently welcome to use mine those to validate and test your setup though.

### Configuring

If you self-deployed VDO.Ninja, you may need to update the code to point to your whip server, intead of whip.vdo.ninja.

In your `whip.js` file, you will also want to update the code so that whip.vdo.ninja is replaced with your whip server address, whereever it is found.

### Starting the server

To start the server, follow these steps:

1. Open your terminal and navigate to your project directory.

2. Use the following command to start the server:

   ```
   sudo node whip.js
   ```

   Replace `whip.js` with the name of your server script if it's different.

   The server should now be running, and you'll see log messages indicating its status.

3. For production deployment, consider setting up the script to run as an auto-starting system service.
 

### Limited deployment support

If there is a problem with the code itself, or you have a feature request, create a ticket on Github or let me know on the Discord server (discord.vdo.ninja).

I do not have time to help everyone with setting up SSL or TURN servers, etc, so support for those steps will be currently out of scope for this project. That may change in time.


## PLEASE CONTRIBUTE FIXES / IMPROVEMENTS 

💘



