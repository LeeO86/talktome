const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http2 = require("node:http2");
const { EventEmitter } = require("node:events");

const { ApplePttPushService } = require("./applePttPushService");

test("sends Push to Talk notifications with Apple's required APNs headers", async () => {
  const originalConnect = http2.connect;
  const requests = [];
  const privateKey = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })
    .privateKey.export({ type: "pkcs8", format: "pem" });

  http2.connect = () => ({
    request(headers) {
      requests.push(headers);
      const request = new EventEmitter();
      request.setEncoding = () => {};
      request.end = () => {
        request.emit("response", { ":status": 200 });
        request.emit("end");
      };
      return request;
    },
    close() {},
  });

  try {
    const service = new ApplePttPushService({
      loadConfig: () => ({
        applePtt: {
          enabled: true,
          teamId: "TEAMID1234",
          keyId: "KEYID12345",
          bundleId: "com.example.talktome",
          privateKey,
          environment: "development",
        },
      }),
    });

    await service.sendActiveRemoteParticipant({
      registrations: [{ user_id: 7, push_token: "device-token" }],
      participantName: "Operator",
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0]["apns-push-type"], "pushtotalk");
    assert.equal(requests[0]["apns-topic"], "com.example.talktome.voip-ptt");
    assert.equal(requests[0]["apns-priority"], "10");
    assert.equal(requests[0]["apns-expiration"], "0");
  } finally {
    http2.connect = originalConnect;
  }
});
