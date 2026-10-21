import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveApiBase } from "../js/api.js";

const PAGE = "http://localhost:8000";
const ok = (search, base) => assert.deepEqual(resolveApiBase(search, PAGE), { base, ignored: false }, search);
const refused = (search, origin = PAGE) => assert.deepEqual(resolveApiBase(search, origin), { base: "", ignored: true }, search);

test("no ?api= means the page's own origin, and nothing is reported as ignored", () => {
  ok("", "");
  ok("?other=1", "");
});

test("localhost addresses on any port are accepted", () => {
  ok("?api=http://localhost:8000", "http://localhost:8000");
  ok("?api=http://127.0.0.1:9", "http://127.0.0.1:9");
  ok("?api=http://[::1]:8000", "http://[::1]:8000");
  ok("?api=https://localhost:8443", "https://localhost:8443");
});

test("only the origin is kept, so a path or query cannot be smuggled in", () => {
  ok("?api=http://localhost:8000/evil/path?x=1#frag", "http://localhost:8000");
});

test("the page's own origin is accepted when it is not localhost", () => {
  assert.deepEqual(resolveApiBase("?api=https://demo.example.org", "https://demo.example.org"), { base: "https://demo.example.org", ignored: false });
});

test("someone else's server is refused", () => {
  refused("?api=https://evil.example");
  refused("?api=http://evil.example:8000");
  refused("?api=https://demo.example.org", "https://other.example.org");
});

test("look-alike hosts are refused", () => {
  refused("?api=http://localhost.evil.com");
  refused("?api=http://evil.com/localhost");
  refused("?api=http://127.0.0.1.evil.com");
  refused("?api=http://notlocalhost:8000");
  refused("?api=http://localhost:8000@evil.com");           // the real host here is evil.com
});

test("addresses with credentials are refused even for localhost", () => {
  refused("?api=http://user:pass@localhost:8000");
  refused("?api=http://user@localhost:8000");
});

test("non-web schemes and malformed values are refused", () => {
  refused("?api=javascript:alert(1)");
  refused("?api=data:text/html,<script>alert(1)</script>");
  refused("?api=file:///etc/passwd");
  refused("?api=ftp://localhost");
  refused("?api=//evil.example");
  refused("?api=not a url");
  refused("?api=%00");
});

test("a protocol-relative or relative value is not treated as same-origin", () => {
  refused("?api=/layers", "");
  refused("?api=localhost:8000");
});
