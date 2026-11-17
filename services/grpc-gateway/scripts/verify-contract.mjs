import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const protoUrl = new URL(
  "../proto/nodezuno/ethereum/v1/ethereum_proxy.proto",
  import.meta.url,
);
const registrationUrl = new URL(
  "../internal/contract/ethereumv1/service.go",
  import.meta.url,
);

const [proto, registration] = await Promise.all([
  readFile(protoUrl, "utf8"),
  readFile(registrationUrl, "utf8"),
]);

assert.match(proto, /^syntax = "proto3";$/m);
assert.match(proto, /^package nodezuno\.ethereum\.v1;$/m);
assert.match(proto, /import "google\/protobuf\/struct\.proto";/);
assert.match(proto, /service EthereumProxy\s*\{/);
assert.match(
  proto,
  /rpc Call\(google\.protobuf\.Struct\) returns \(google\.protobuf\.Struct\);/,
);

assert.match(
  registration,
  /ServiceName = "nodezuno\.ethereum\.v1\.EthereumProxy"/,
);
assert.match(
  registration,
  /CallFullMethodName = "\/nodezuno\.ethereum\.v1\.EthereumProxy\/Call"/,
);
assert.match(registration, /MethodName: "Call"/);
assert.match(
  registration,
  /Metadata: "nodezuno\/ethereum\/v1\/ethereum_proxy\.proto"/,
);
assert.doesNotMatch(registration, /Code generated .* DO NOT EDIT/);

process.stdout.write("native gRPC protobuf contract is aligned\n");
