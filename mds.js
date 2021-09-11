/* A minimal example for forwarding data with web bluetooth */

const mdsService = "54220000-f6a5-4007-a371-722f4ebd8436";
let receivedChunks = [];
let messageBeingSent = false;
let chunksReceived = 0;

let bluetoothDevice;
let mdsServiceRef;
let infoCharacteristicRef;

let authorizationHeader = null;
let dataUri = null;
let deviceIdentifier = null;

function sendChunkToMemfault() {
  if (messageBeingSent) {
    // we can only send one chunk at a time
    return;
  }

  if (receivedChunks.length === 0) {
    console.log("All Chunks Sent!");
    return;
  }

  messageBeingSent = true;
  data = receivedChunks.shift();

  const xhr = new XMLHttpRequest();

  xhr.addEventListener("readystatechange", function () {
    let status = xhr.status;
    if (xhr.readyState === XMLHttpRequest.DONE) {
      console.log(xhr.responseText);
      messageBeingSent = false;
      sendChunkToMemfault();
    }
  });

  xhr.open("POST", dataUri);

  const idx = authorizationHeader.indexOf(":");
  if (idx === -1) {
    console.log("Invalid authorization config");
    return;
  }

  const authKey = authorizationHeader.substring(0, idx);
  const authValue = authorizationHeader.substring(idx + 1);

  xhr.setRequestHeader(authKey, authValue);
  xhr.setRequestHeader("Content-Type", "application/octet-stream");
  xhr.send(data);
}

function reportProgress(progressText) {
  console.log(progressText);
  document.getElementById("chunk_status").innerHTML = progressText;
}

async function connectAndSubscribe() {
  reportProgress("Scanning ...");

  bluetoothDevice = await navigator.bluetooth.requestDevice({
    optionalServices: [mdsService],
    acceptAllDevices: true,
  });

  bluetoothDevice.addEventListener("gattserverdisconnected", onDisconnected);
  reportProgress(`Connecting to ${bluetoothDevice.name}`);

  const server = await bluetoothDevice.gatt.connect();

  const mdsServiceRef = await server.getPrimaryService(mdsService);

  const versionCharacteristic = await mdsServiceRef.getCharacteristic(
    "54220001-f6a5-4007-a371-722f4ebd8436"
  );
  const deviceIdentifierCharacteristic = await mdsServiceRef.getCharacteristic(
    "54220002-f6a5-4007-a371-722f4ebd8436"
  );
  const dataUriCharacteristic = await mdsServiceRef.getCharacteristic(
    "54220003-f6a5-4007-a371-722f4ebd8436"
  );
  const authCharacteristic = await mdsServiceRef.getCharacteristic(
    "54220004-f6a5-4007-a371-722f4ebd8436"
  );

  const versionData = await versionCharacteristic.readValue();
  const version = new Uint8Array(versionData.buffer);
  console.log(`MDS Version: ${version[0]}.${version[1]}.${version[2]}`);

  if (version[0] !== 1) {
    reportProgress("Unsupported MDS version!");
    return;
  }

  const deviceIdentifierData = await deviceIdentifierCharacteristic.readValue();
  const dataUriData = await dataUriCharacteristic.readValue();
  const authorizationData = await authCharacteristic.readValue();

  deviceIdentifier = String.fromCharCode.apply(
    null,
    new Uint8Array(deviceIdentifierData.buffer)
  );

  dataUri = String.fromCharCode.apply(null, new Uint8Array(dataUriData.buffer));

  authorizationHeader = String.fromCharCode.apply(
    null,
    new Uint8Array(authorizationData.buffer)
  );

  console.log(`Device Identifier: ${deviceIdentifier}`);
  console.log(`Data Uri: ${dataUri}`);
  console.log(`Authorization: ${authorizationHeader}`);

  // We've now read the projectKey & deviceIdentifier!
  // time to start draining chunks

  const chunkCharacteristic = await mdsServiceRef.getCharacteristic(
    "54220005-f6a5-4007-a371-722f4ebd8436"
  );

  chunkCharacteristic.addEventListener(
    "characteristicvaluechanged",
    handleChunk
  );
  await chunkCharacteristic.startNotifications();

  reportProgress("Connected!");
}

async function connect() {
  try {
    await connectAndSubscribe();
  } catch (error) {
    console.log(error);
    reportProgress("Connection failed!", error);
  }
}

function buf2hex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

// handle incoming data:
function handleChunk(event) {
  console.log(
    `Chunk Length: ${event.target.value.byteLength} Data: ${buf2hex(
      event.target.value.buffer
    )}`
  );
  chunksReceived += 1;
  reportProgress(`Forwarded ${chunksReceived} Memfault Chunks`);

  receivedChunks.push(event.target.value);
  sendChunkToMemfault();
}

function onDisconnected(event) {
  reportProgress("Disconnected");
}

function disconnect() {
  if (bluetoothDevice) {
    bluetoothDevice.gatt.disconnect();
  }
}
