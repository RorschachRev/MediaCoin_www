/*
Copyright 2017 Google Inc.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';
// EME Check
var keySystems = {
  widevine: ['com.widevine.alpha'],
  playready: ['com.microsoft.playready', 'com.youtube.playready'],
  clearkey: ['webkit-org.w3.clearkey', 'org.w3.clearkey'],
  primetime: ['com.adobe.primetime', 'com.adobe.access'],
  fairplay: ['com.apple.fairplay']
};
var keySystemsCount = (function () {
  var count = 0;
  for (keysys in keySystems) {
    if (keySystems.hasOwnProperty(keysys)) {
      count += keySystems[keysys].length;
    }
  }
  return count;
})();

var testVideoElement = document.createElement('video');
var supportedSystems = [];
var unsupportedSystems = [];

var supportsEncryptedMediaExtension = function () {
  if (!testVideoElement.mediaKeys) {
    if (window.navigator.requestMediaKeySystemAccess) {
      if (typeof window.navigator.requestMediaKeySystemAccess === 'function') {
        console.log('found default EME');
        hasEME = true;
        var isKeySystemSupported = function (keySystem) {
          var config = [{initDataTypes: ['cenc']}];
          if (window.navigator.requestMediaKeySystemAccess) {
            window.navigator.requestMediaKeySystemAccess(keySystem, config).then(function (keySystemAccess) {
              supportedSystems.push(keySystem);
            }).catch(function () {
              unsupportedSystems.push(keySystem);
            });
          }
        };
        var keysys, dummy, i;
        for (keysys in keySystems) {
          if (keySystems.hasOwnProperty(keysys)) {
            for (dummy in keySystems[keysys]) {
              isKeySystemSupported(keySystems[keysys][dummy]);
            }
          }
        }
      }
    } else if (window.MSMediaKeys) {
      if (typeof window.MSMediaKeys === 'function') {
        console.log('found MS-EME');
        hasEME = true;
        var keysys, dummy, i;
        for (keysys in keySystems) {
          if (keySystems.hasOwnProperty(keysys)) {
            for (dummy in keySystems[keysys]) {
              if (MSMediaKeys.isTypeSupported(keySystems[keysys][dummy])) {
                supportedSystems.push(keySystems[keysys][dummy]);
              } else {
                unsupportedSystems.push(keySystems[keysys][dummy]);
              }
            }
          }
        }
      }
    } else if (testVideoElement.webkitGenerateKeyRequest) {
      if (typeof testVideoElement.webkitGenerateKeyRequest === 'function') {
        console.log('found WebKit EME');
        hasEME = true;
        var keysys, dummy, i;
        for (keysys in keySystems) {
          if (keySystems.hasOwnProperty(keysys)) {
            for (dummy in keySystems[keysys]) {
              if (testVideoElement.canPlayType('video/mp4', keySystems[keysys][dummy])) {
                supportedSystems.push(keySystems[keysys][dummy]);
              } else {
                unsupportedSystems.push(keySystems[keysys][dummy]);
              }
            }
          }
        }
      }
    } else {
      console.log('no supported EME implementation found');
      hasEME = false;
    }
  }
}

// Define a key: hardcoded in this example
// This corresponds to the key used for encryption
var KEY = new Uint8Array([
  0xeb, 0xdd, 0x62, 0xf1, 0x68, 0x14, 0xd2, 0x7b,
  0x68, 0xef, 0x12, 0x2a, 0xfc, 0xe4, 0xae, 0x3c
]);

var config = [{
  initDataTypes: ['webm'],
  videoCapabilities: [{
    contentType: 'video/webm; codecs="vp8"'
  }]
}];

var video = document.querySelector('video');
video.addEventListener('encrypted', handleEncrypted, false);

window.navigator.requestMediaKeySystemAccess('org.w3.clearkey', config).then(
  function(keySystemAccess) {
    return keySystemAccess.createMediaKeys();
  }
).then(
  function(createdMediaKeys) {
    return video.setMediaKeys(createdMediaKeys);
  }
).catch(
  function(error) {
    console.error('Failed to set up MediaKeys', error);
  }
);

function handleEncrypted(event) {
  console.log('encrypted event:', event);
  var session = video.mediaKeys.createSession();
  session.addEventListener('message', handleMessage, false);
  session.generateRequest(event.initDataType, event.initData).catch(
    function(error) {
      console.error('Failed to generate a license request', error);
    }
  );
}

function handleMessage(event) {
  console.log('message event: ', event);
  // If you had a license server, you would make an asynchronous XMLHttpRequest
  // with event.message as the body.  The response from the server, as a
  // Uint8Array, would then be passed to session.update().
  // Instead, we will generate the license synchronously on the client, using
  // the hard-coded KEY at the top.
  var license = generateLicense(event.message);
  console.log('license: ', license);

  var session = event.target;
  session.update(license).catch(
    function(error) {
      console.error('Failed to update the session', error);
    }
  );
}

// Convert Uint8Array into base64 using base64url alphabet, without padding.
function toBase64(u8arr) {
  return btoa(String.fromCharCode.apply(null, u8arr)).
    replace(/\+/g, '-').replace(/\//g, '_').replace(/=*$/, '');
}

// This takes the place of a license server.
// kids is an array of base64-encoded key IDs
// keys is an array of base64-encoded keys
function generateLicense(message) {
  // Parse the clearkey license request.
  var request = JSON.parse(new TextDecoder().decode(message));
  // We only know one key, so there should only be one key ID.
  // A real license server could easily serve multiple keys.
  console.assert(request.kids.length === 1);

  var keyObj = {
    kty: 'oct',
    alg: 'A128KW',
    kid: request.kids[0],
    k: toBase64(KEY)
  };
  return new TextEncoder().encode(JSON.stringify({
    keys: [keyObj]
  }));
}
