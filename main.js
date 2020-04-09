'use strict';

require("web-streams-polyfill");
const webStreams = require('web-streams-node');
const fileReaderStream = require('filereader-stream');
const streamSaver = require('streamsaver');

const numSubClients = 4;
const sessionConfig = { mtu: 16000 };
var client;

(function () {
  client = new nkn.MultiClient({ numSubClients, sessionConfig, tls: true });

  client.listen();

  client.onConnect(() => {
    document.getElementById('local-addr').value = client.addr;
    M.updateTextFields();
  });

  client.onSession(async (session) => {
    console.log(session.localAddr, 'accepted a session from', session.remoteAddr);

    let fileNameLen = await readUint32(session);
    let fileNameEncoded = await readN(session, fileNameLen);
    let fileName = new TextDecoder().decode(fileNameEncoded);
    let fileSize = await readUint32(session);

    displayLog(`Start receiving ${fileName} (${fileSize} bytes) from ${session.remoteAddr}`);

    let sessionStream = session.getReadableStream();
    let downloadStream = streamSaver.createWriteStream(fileName, { size: fileSize });
    let timeStart = Date.now();
    sessionStream.pipeTo(downloadStream).then(() => {
      displayLog(`Finish receiving file ${fileName} (${fileSize} bytes, ${fileSize / (1<<20) / (Date.now() - timeStart) * 1000} MB/s)`);
    }, console.error);
  });

  document.getElementById('send').onclick = async () => {
    let remoteAddr = document.getElementById('remote-addr').value;
    if (!remoteAddr) {
      alert("Please enter receiver's address");
      return;
    }

    let file = document.getElementById('file-input').files[0];
    if (!file) {
      alert("Please select file to send");
      return;
    }

    let session = await client.dial(remoteAddr);
    session.setLinger(-1);
    console.log(session.localAddr, 'dialed a session to', session.remoteAddr);

    let fileNameEncoded = new TextEncoder().encode(file.name);
    await writeUint32(session, fileNameEncoded.length);
    await session.write(fileNameEncoded);
    await writeUint32(session, file.size);

    displayLog(`Start sending ${file.name} (${file.size} bytes) to ${session.remoteAddr}`);

    document.getElementById('file-input').value = '';
    document.getElementById('file-name').value = '';

    let uploadStream = webStreams.toWebReadableStream(fileReaderStream(file));
    let sessionStream = session.getWritableStream(true);
    let timeStart = Date.now();
    uploadStream.pipeTo(sessionStream).then(() => {
      displayLog(`Finish sending file ${file.name} (${file.size} bytes, ${file.size / (1<<20) / (Date.now() - timeStart) * 1000} MB/s)`);
    }, console.error);
  };
})()

function displayLog(content) {
  console.log(content);
  let li=document.createElement('li');
  li.innerHTML = content;
  document.getElementById('log-list').appendChild(li);
}

async function readN(session, n) {
  let buf = new Uint8Array(0);
  while (buf.length < n) {
    buf = mergeUint8Array(buf, await session.read(n - buf.length));
  }
  return buf;
}

async function readUint32(session) {
  let buf = await readN(session, 4);
  let dv = new DataView(buf.buffer);
  return dv.getUint32(0, true);
}

async function writeUint32(session, n) {
  let buffer = new ArrayBuffer(4);
  let dv = new DataView(buffer);
  dv.setUint32(0, n, true);
  await session.write(new Uint8Array(buffer));
}

function mergeUint8Array(head, tail) {
  let merged = new Uint8Array(head.length + tail.length);
  merged.set(head);
  merged.set(tail, head.length);
  return merged;
};
