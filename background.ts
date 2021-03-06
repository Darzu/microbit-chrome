///<reference path='typings/browser.d.ts'/>
// A list of: {
//   id: number;
//   path: string;
// } where [id] is the [connectionId] (internal to Chrome) and [path] is the
// OS' name for the device (e.g. "COM4").
interface Connection {
    id:string;
    path:string;
}
var connections : Connection[] = [];

// A list of "ports", i.e. connected clients (such as web pages). Multiple web
// pages can connect to our service: they all receive the same data.
var ports = [];

interface Message {
    type:string;
    data:string;
    id:string;
}

function byPath(path : string) : Connection[] {
  return connections.filter((x) => x.path == path);
}

function byId(id : string) : Connection[] {
  return connections.filter((x) => x.id == id);
}

function onReceive(data, id: string) {
    if (ports.length == 0) return;

    var view = new DataView(data);
    var decoder = new TextDecoder("utf-8");
    var decodedString = decoder.decode(view);

    ports.forEach(port => port.postMessage(<Message>{
      type: "serial",
      data: decodedString,
      id: id,
    }));
}

function isMicrobitOnMac(serialPort) {
  return (serialPort.displayName == "MBED CMSIS_DAP" 
    && serialPort.path.indexOf("/dev/tty") == 0);
}
function isMicrobitOnWindows(serialPort) {
  return serialPort.displayName == "mbed Serial Port";
}
function isMicrobit(serialPort) {
  return isMicrobitOnWindows(serialPort) || isMicrobitOnMac(serialPort)
 }

function findNewDevices() {
  chrome.serial.getDevices(function (serialPorts) {
    serialPorts.forEach(function (serialPort) {
      if (byPath(serialPort.path).length == 0 && isMicrobit(serialPort))
      {
        chrome.serial.connect(serialPort.path, { bitrate: 115200 }, function (info) {
        // In case the [connect] operation takes more than five seconds...
        if (info && byPath(serialPort.path).length == 0)
                connections.push({
                id: info.connectionId,
                path: serialPort.path
                });
        });              
      }
    });
  });
}

function main() {
  // Register new clients in the [ports] global variable.
  chrome.runtime.onConnectExternal.addListener(function (port) {
    if (/^(micro:bit|touchdevelop|yelm|pxt|codemicrobit|codethemicrobit)$/.test(port.name)) {
      ports.push(port);
      port.onDisconnect.addListener(function () {
        ports = ports.filter(function (x) { return x != port });
      });
    }
  });

  // When receiving data for one of the connections that we're tracking, forward
  // it to all connected clients.
  chrome.serial.onReceive.addListener(function (info) {
    if (byId(info.connectionId).length > 0)
      onReceive(info.data, info.connectionId);
  });

  // When it looks like we've been disconnected, drop the corresponding
  // connection object from the [connections] global variable.
  chrome.serial.onReceiveError.addListener(function (info) {
    if (info.error == "system_error" || info.error == "disconnected" || info.error == "device_lost")
      connections = connections.filter((x) => x.id != info.connectionId);
  });

  // Probe serial connections at regular intervals. In case we find an mbed port
  // we haven't yet connected to, connect to it.
  setInterval(findNewDevices, 4000);
  findNewDevices();
}

document.addEventListener("DOMContentLoaded", main);
