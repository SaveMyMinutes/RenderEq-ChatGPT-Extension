// content.js
// Injects a custom "Copy MD + LaTeX" button into ChatGPT assistant messages.
// It converts KaTeX HTML to $...$ / $$...$$ and then to Markdown.

(function () {
  const BUTTON_CLASS = "katex-md-copy-button";
  const BUTTON_TEXT = "";

  function log(...args) {
    console.log("[KaTeX MD Copy]", ...args);
  }

  /**
   * Convert ChatGPT HTML (with KaTeX) to Markdown with $...$ / $$...$$ math.
   */
  function convertHtmlWithKatexToMarkdown(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Extract original TeX from KaTeX
    function getTexFromKatex(el) {
      const annotation = el.querySelector(
        '.katex-mathml annotation[encoding="application/x-tex"]'
      );
      if (annotation && annotation.textContent) {
        return annotation.textContent.trim();
      }
      return el.textContent.trim();
    }

    // 1) Display math: .katex-display → $$ ... $$
    doc.querySelectorAll(".katex-display").forEach((displayEl) => {
      const tex = getTexFromKatex(displayEl);
      const md = "\n\n$$\n" + tex + "\n$$\n\n";
      displayEl.replaceWith(doc.createTextNode(md));
    });

    // 2) Inline math: .katex not inside .katex-display → $...$
    doc.querySelectorAll(".katex").forEach((inlineEl) => {
      if (inlineEl.closest(".katex-display")) return; // already handled
      const tex = getTexFromKatex(inlineEl);
      const md = "$" + tex + "$";
      inlineEl.replaceWith(doc.createTextNode(md));
    });

    // 3) HTML → Markdown (simple custom converter, no external libs)

    function nodesToMarkdown(nodeList) {
      let out = "";
      nodeList.forEach((node) => {
        out += nodeToMarkdown(node);
      });
      return out;
    }

    function nodeToMarkdown(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        // Collapse whitespace into single spaces
        return node.textContent.replace(/\s+/g, " ");
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }

      const tag = node.tagName.toLowerCase();

      switch (tag) {
        case "br":
          return "  \n";

        case "p":
          return (
            "\n\n" +
            nodesToMarkdown(Array.from(node.childNodes)).trim() +
            "\n\n"
          );

        case "strong":
        case "b":
          return (
            "**" + nodesToMarkdown(Array.from(node.childNodes)).trim() + "**"
          );

        case "em":
        case "i":
          return (
            "_" + nodesToMarkdown(Array.from(node.childNodes)).trim() + "_"
          );

        case "code": {
          const parent = node.parentElement;
          // If inside <pre>, let <pre> handle fencing
          if (parent && parent.tagName.toLowerCase() === "pre") {
            return node.textContent;
          }
          return "`" + node.textContent + "`";
        }

        case "pre": {
          let codeNode = node.querySelector("code");
          let codeText = codeNode ? codeNode.textContent : node.textContent;
          // trim leading/trailing newlines
          codeText = codeText.replace(/^\n+|\n+$/g, "");
          return "\n\n```\n" + codeText + "\n```\n\n";
        }

        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6": {
          const level = parseInt(tag[1], 10);
          const hashes = "#".repeat(level);
          return (
            "\n\n" +
            hashes +
            " " +
            nodesToMarkdown(Array.from(node.childNodes)).trim() +
            "\n\n"
          );
        }

        case "ul": {
          let result = "\n\n";
          Array.from(node.children).forEach((li) => {
            const text = nodesToMarkdown(Array.from(li.childNodes)).trim();
            if (text) {
              result += "- " + text + "\n";
            }
          });
          return result + "\n";
        }

        case "ol": {
          let result = "\n\n";
          let index = 1;
          Array.from(node.children).forEach((li) => {
            const text = nodesToMarkdown(Array.from(li.childNodes)).trim();
            if (text) {
              result += index + ". " + text + "\n";
              index += 1;
            }
          });
          return result + "\n";
        }

        case "a": {
          const href = node.getAttribute("href") || "";
          const text =
            nodesToMarkdown(Array.from(node.childNodes)).trim() || href;
          if (!href) return text;
          return "[" + text + "](" + href + ")";
        }

        case "blockquote": {
          const inner = nodesToMarkdown(Array.from(node.childNodes)).trim();
          if (!inner) return "";
          const lines = inner
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          return "\n\n" + lines.map((l) => "> " + l).join("\n") + "\n\n";
        }

        case "table": {
          const rows = [];
          const headerCells = node.querySelectorAll("thead tr th");

          if (headerCells.length) {
            const header = Array.from(headerCells).map((c) =>
              c.textContent.trim()
            );
            rows.push("| " + header.join(" | ") + " |");
            rows.push("| " + header.map(() => "---").join(" | ") + " |");
            const bodyRows = node.querySelectorAll("tbody tr");
            bodyRows.forEach((tr) => {
              const cells = Array.from(tr.children).map((c) =>
                c.textContent.trim()
              );
              rows.push("| " + cells.join(" | ") + " |");
            });
          } else {
            const bodyRows = node.querySelectorAll("tr");
            bodyRows.forEach((tr) => {
              const cells = Array.from(tr.children).map((c) =>
                c.textContent.trim()
              );
              rows.push("| " + cells.join(" | ") + " |");
            });
          }

          return "\n\n" + rows.join("\n") + "\n\n";
        }

        // Inline-ish containers
        case "span":
        case "label":
        case "small":
        case "sub":
        case "sup":
          return nodesToMarkdown(Array.from(node.childNodes));

        // Block containers
        case "div":
        case "section":
        case "article":
        case "header":
        case "footer":
        case "main":
          return "\n" + nodesToMarkdown(Array.from(node.childNodes)) + "\n";

        default:
          return nodesToMarkdown(Array.from(node.childNodes));
      }
    }

    function normalizeMarkdown(md) {
      return md
        .replace(/[ \t]+\n/g, "\n") // strip trailing spaces on lines
        .replace(/\n{3,}/g, "\n\n") // collapse 3+ blank lines ↦ 2
        .trim();
    }

    const rawMd = nodesToMarkdown(Array.from(doc.body.childNodes));
    return normalizeMarkdown(rawMd);
  }

  /**
   * Copy one ChatGPT assistant message as Markdown.
   */
  function copyMessageAsMarkdown(messageEl) {
    const markdownContainer = messageEl.querySelector(".markdown");
    const html = markdownContainer
      ? markdownContainer.innerHTML
      : messageEl.innerHTML;
    const md = convertHtmlWithKatexToMarkdown(html);

    navigator.clipboard.writeText(md).then(
      () => {
        showCopiedState(messageEl);
      },
      (err) => {
        console.error("Clipboard write failed", err);
        alert("Failed to copy markdown to clipboard.");
      }
    );
  }

  function showCopiedState(messageEl) {
    const btn = messageEl.querySelector("." + BUTTON_CLASS);
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = "Copied!";
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1500);
  }

  function createCopyButton() {
    const btn = document.createElement("button");
    btn.className = BUTTON_CLASS;
    btn.textContent = BUTTON_TEXT;
    btn.type = "button";

    // Simple styling to sit in the top-right corner of the bubble
    btn.style.position = "absolute";
    btn.style.top = "8px";
    btn.style.right = "8px";
    btn.style.zIndex = "50";
    btn.style.padding = "4px 8px";
    btn.style.fontSize = "12px";
    btn.style.borderRadius = "6px";
    btn.style.border = "1px solid rgba(128,128,128,0.6)";
    btn.style.background = "rgba(0,0,0,0.05)";
    btn.style.cursor = "pointer";
    btn.style.backdropFilter = "blur(0px)";
    btn.style.color = "inherit";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.gap = "4px";

    btn.addEventListener("mouseover", () => {
      btn.style.background = "rgba(0,0,0,0.1)";
    });
    btn.addEventListener("mouseout", () => {
      btn.style.background = "rgba(0,0,0,0.05)";
    });

    const icon = document.createElement("span");
    icon.textContent = "📋";
    btn.prepend(icon);

    return btn;
  }

  /**
   * Attach buttons to all assistant messages.
   */
  function attachButtons() {
    const messages = document.querySelectorAll(
      'div[data-message-author-role="assistant"]'
    );

    messages.forEach((msg) => {
      if (msg.querySelector("." + BUTTON_CLASS)) {
        return; // already has a button
      }

      // Ensure the message has a positioning context for our absolute button
      const style = getComputedStyle(msg);
      if (style.position === "static") {
        msg.style.position = "relative";
      }

      const btn = createCopyButton();
      btn.addEventListener("click", () => copyMessageAsMarkdown(msg));

      msg.appendChild(btn);
    });
  }

  // Initial run
  attachButtons();

  // Watch for new messages being added dynamically
  const observer = new MutationObserver(() => {
    attachButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  log("Content script loaded");
})();
