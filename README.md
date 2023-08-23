# WHIP server code for VDO.Ninja
A VDO.Ninja-specific WHIP/WHEP API and integration wrapper

There are multiple goals of this project:
- to allow for self-hosting of the WHIP/WHEP service used by VDO.Ninja.
- to be a universally compatible WHIP/WHEP endpoint that's up to full spec. (WIP)
- To allow VDO.Ninja users to use their own WHIP/WHEP service in place of Meshcast.io (WIP)
- Potentially also offer easy integration support for popular SFU servers and services, such as Cloudflare/PION

This service is written in Node.js, as to be accessible to all-levels of developers; it can be self-hosted or migrated to use with popular cloud worker services.

### To use

Install NodeJS and whatever depedencies you need.

You may need to use SSL certs if not using a CDN that offers SSL tunneling; webRTC typically requires valid SSL. 

To start the script,
`sudo nodejs whip.js`

Please do not use the VDO.Ninja TURN servers with your independent projects. Deploy your own if needed; you are currently welcome to use them to validate and test your setup however.

## PLEASE CONTRIBUTE FIXES / IMPROVEMENTS 💘



