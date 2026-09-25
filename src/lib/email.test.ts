import { describe, expect, it } from "vitest";
import { toHtml } from "./email";

describe("toHtml", () => {
  it("escapes HTML a tenant might type into a repair request", () => {
    const html = toHtml(`Leak <img src=x onerror=alert(1)> & "stuff"`);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;stuff&quot;");
  });

  it("makes pay links clickable without swallowing the full stop", () => {
    const html = toHtml("Pay online: https://example.com/pay/abc123. Thanks");
    expect(html).toContain('<a href="https://example.com/pay/abc123" style="color:#1d4ed8">https://example.com/pay/abc123</a>. Thanks');
  });

  it("doesn't turn an escaped link into markup", () => {
    const html = toHtml('<a href="https://evil.test">click</a>');
    expect(html).not.toContain('<a href="https://evil.test">click');
  });
});

describe("toHtml links next to escaped text", () => {
  it("stops a link at escaped characters", () => {
    expect(toHtml('"https://a.test/x"')).toBe('&quot;<a href="https://a.test/x" style="color:#1d4ed8">https://a.test/x</a>&quot;');
  });
});
