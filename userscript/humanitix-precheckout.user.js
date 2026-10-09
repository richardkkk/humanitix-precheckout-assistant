// ==UserScript==
// @name         Humanitix Pre-checkout Assistant
// @namespace    https://github.com/richardkkk/humanitix-precheckout-assistant
// @version      1.4.4
// @description  Prepare Humanitix tickets with local profiles, scheduled releases, and a manual final wallet step.
// @author       Richard
// @license      MIT
// @homepageURL  https://github.com/richardkkk/humanitix-precheckout-assistant
// @supportURL   https://github.com/richardkkk/humanitix-precheckout-assistant/issues
// @downloadURL  https://raw.githubusercontent.com/richardkkk/humanitix-precheckout-assistant/main/userscript/humanitix-precheckout.user.js
// @updateURL    https://raw.githubusercontent.com/richardkkk/humanitix-precheckout-assistant/main/userscript/humanitix-precheckout.user.js
// @match        https://events.humanitix.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG_KEY = "arc-humanitix-config-v1";
  const ACTIVE_KEY = "arc-humanitix-active-v1";
  const DEFAULT_CONFIG = {
    selectedProfile: "me",
    profiles: {
      me: {
        firstName: "",
        lastName: "",
        email: "",
        mobile: "",
        zid: "",
        enrolmentType: "International",
        studyLevel: "Postgraduate",
        studyLoad: "Full-Time",
        accessibilityRequirements: "",
      },
    },
    preferences: {
      humanitixMarketing: false,
      organiserMarketing: false,
      acceptArcTerms: true,
      autoStartScheduledEvents: true,
    },
    payment: {
      method: "google-pay",
      openPaymentSheet: true,
      checkoutButtonText: "",
    },
    events: [],
  };

  let running = false;
  let panel;
  let statusNode;
  let paymentActionButton;
  let manualChoiceButton;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };

  function normalizeEventUrl(rawUrl = location.href) {
    const url = new URL(rawUrl);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/tickets$/, "").replace(/\/au\/[^/]+\/details$/, "");
    return url.toString().replace(/\/$/, "");
  }

  function loadConfig() {
    const saved = GM_getValue(CONFIG_KEY, null);
    if (!saved) return structuredClone(DEFAULT_CONFIG);
    try {
      return typeof saved === "string" ? JSON.parse(saved) : saved;
    } catch {
      return structuredClone(DEFAULT_CONFIG);
    }
  }

  function saveConfig(config) {
    GM_setValue(CONFIG_KEY, JSON.stringify(config));
  }

  function hasCompleteProfile(config) {
    const profile = config.profiles?.[config.selectedProfile];
    return Boolean(
      profile &&
        ["firstName", "lastName", "email", "mobile", "zid"].every((key) =>
          String(profile[key] || "").trim(),
        ),
    );
  }

  function setStatus(message, tone = "normal") {
    if (!statusNode) return;
    statusNode.textContent = message;
    const styles = {
      normal: { color: "#344054", background: "transparent", weight: "400" },
      waiting: { color: "#175cd3", background: "#eff8ff", weight: "700" },
      ok: { color: "#067647", background: "#ecfdf3", weight: "700" },
      error: { color: "#b42318", background: "#fef3f2", weight: "700" },
    };
    const style = styles[tone] || styles.normal;
    statusNode.style.color = style.color;
    statusNode.style.background = style.background;
    statusNode.style.fontWeight = style.weight;
    statusNode.style.padding = tone === "normal" ? "0" : "8px";
    statusNode.style.borderRadius = tone === "normal" ? "0" : "8px";
  }

  function stop(message, tone = "error") {
    running = false;
    sessionStorage.removeItem(ACTIVE_KEY);
    if (paymentActionButton) paymentActionButton.hidden = true;
    if (manualChoiceButton) manualChoiceButton.hidden = true;
    setStatus(message, tone);
    console.warn(`[Arc helper] ${message}`);
  }

  function start() {
    const config = loadConfig();
    if (!hasCompleteProfile(config)) {
      stop("首次使用需要先填写个人资料。", "error");
      openSetup();
      return;
    }
    sessionStorage.setItem(ACTIVE_KEY, "1");
    run().catch((error) => stop(error.message));
  }

  async function waitFor(predicate, description, timeout = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (!running) throw new Error("助手已停止。");
      const botError = normalize(document.body?.innerText).match(/Bot protection could not verify your browser/i);
      if (botError) throw new Error("Humanitix 无法验证当前浏览器；已停止，不会重试或绕过。");
      const value = await predicate();
      if (value) return value;
      await sleep(120);
    }
    throw new Error(`等待超时：${description}`);
  }

  function allVisible(selector) {
    return [...document.querySelectorAll(selector)].filter(visible);
  }

  function findButton(pattern) {
    return allVisible("button, [role='button']").find((element) => pattern.test(normalize(element.innerText || element.getAttribute("aria-label"))));
  }

  function findPaymentControl(pattern) {
    const direct = allVisible("button, [role='button'], summary").find((element) =>
      pattern.test(normalize(element.innerText || element.getAttribute("aria-label"))),
    );
    if (direct) return direct;
    const label = [...document.querySelectorAll("div, span")]
      .filter(visible)
      .filter((element) => pattern.test(normalize(element.innerText)))
      .sort((left, right) => normalize(left.innerText).length - normalize(right.innerText).length)[0];
    return label?.closest("summary") || null;
  }

  function setNativeValue(input, value) {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("无法设置输入框值。");
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }

  function inputById(id) {
    const input = document.getElementById(id);
    return input instanceof HTMLInputElement && visible(input) ? input : null;
  }

  function fillInputById(id, value, required = false) {
    const input = inputById(id);
    if (!input) {
      if (required) throw new Error(`找不到必填输入框：${id}`);
      return false;
    }
    setNativeValue(input, value);
    return true;
  }

  function inputNearText(text) {
    const textElement = [...document.querySelectorAll("label, p, div, span")]
      .filter(visible)
      .find((element) => normalize(element.innerText) === text);
    if (!textElement) return null;
    let current = textElement;
    for (let depth = 0; depth < 6 && current; depth += 1, current = current.parentElement) {
      const inputs = [...current.querySelectorAll("input")].filter(visible);
      if (inputs.length === 1) return inputs[0];
    }
    return null;
  }

  function inputNearPattern(pattern) {
    const candidates = [...document.querySelectorAll("label, p, div, span")]
      .filter(visible)
      .filter((element) => pattern.test(normalize(element.innerText)))
      .sort((left, right) => normalize(left.innerText).length - normalize(right.innerText).length);
    for (const candidate of candidates) {
      let current = candidate;
      for (let depth = 0; depth < 6 && current; depth += 1, current = current.parentElement) {
        const inputs = [...current.querySelectorAll("input")].filter(visible);
        if (inputs.length === 1) return inputs[0];
      }
    }
    return null;
  }

  function setCheckbox(id, desired) {
    const checkbox = document.getElementById(id);
    if (!(checkbox instanceof HTMLInputElement)) return;
    if (checkbox.checked === desired) return;
    const control = checkbox.parentElement;
    if (!control || !visible(control)) throw new Error(`找不到可视复选框：${id}`);
    control.click();
    if (checkbox.checked !== desired) throw new Error(`复选框状态未改变：${id}`);
  }

  function checkboxNearText(pattern) {
    const candidates = [...document.querySelectorAll("label, p, span, div")]
      .filter(visible)
      .filter((element) => pattern.test(normalize(element.innerText)))
      .sort((left, right) => normalize(left.innerText).length - normalize(right.innerText).length);
    for (const candidate of candidates) {
      let current = candidate;
      for (let depth = 0; depth < 6 && current; depth += 1, current = current.parentElement) {
        const checkboxes = [...current.querySelectorAll('input[type="checkbox"]')].filter(visible);
        if (checkboxes.length === 1) return checkboxes[0];
      }
    }
    return null;
  }

  function findPriceNearQuantity(input) {
    let current = input;
    for (let depth = 0; depth < 7 && current; depth += 1, current = current.parentElement) {
      const match = normalize(current.innerText).match(/\$\s*(\d+(?:\.\d{1,2})?)/);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function configuredEvent(config) {
    const currentUrl = normalizeEventUrl();
    return config.events?.find((item) => normalizeEventUrl(item.url) === currentUrl) || null;
  }

  function extractNextReleaseAt(text, now = Date.now()) {
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const pattern = /Sales start at\s+(?:[A-Za-z]+\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)\s*(AEDT|AEST)/gi;
    const future = [];
    for (const match of text.matchAll(pattern)) {
      const month = months[match[2].slice(0, 3).toLowerCase()];
      if (month == null) continue;
      let hour = Number(match[4]) % 12;
      if (match[6].toLowerCase() === "pm") hour += 12;
      const offsetHours = match[7].toUpperCase() === "AEDT" ? 11 : 10;
      const timestamp = Date.UTC(
        Number(match[3]), month, Number(match[1]), hour - offsetHours, Number(match[5]), 0,
      );
      if (timestamp > now) future.push(timestamp);
    }
    return future.length ? new Date(Math.min(...future)).toISOString() : null;
  }

  async function waitUntilRelease(event) {
    if (!event?.releaseAt) return false;
    const releaseTime = new Date(event.releaseAt).getTime();
    if (!Number.isFinite(releaseTime) || releaseTime <= Date.now()) return false;
    const precisionWindowMs = 150;
    const precisionStart = releaseTime - precisionWindowMs;
    while (running && Date.now() < precisionStart) {
      const remaining = precisionStart - Date.now();
      const seconds = Math.max(1, Math.ceil((releaseTime - Date.now()) / 1000));
      setStatus(`● 已启动并等待中｜距开售 ${seconds} 秒｜请保持此标签页打开`, "waiting");
      await sleep(Math.min(1000, remaining));
    }
    if (!running) return true;
    setStatus("● 即将开售｜正在进行最后 150ms 精确等待，请保持标签页在前台", "waiting");
    while (running && Date.now() < releaseTime) {
      await sleep(Math.min(10, releaseTime - Date.now()));
    }
    if (!running) return true;
    setStatus("● 已到开售时间，正在刷新票务页…", "ok");
    location.reload();
    return true;
  }

  async function handleTicketPage(config) {
    setStatus("正在识别可购买票种…");
    const body = normalize(document.body.innerText);
    const event = configuredEvent(config);
    const displayedReleaseAt = extractNextReleaseAt(body);
    const releaseTarget = displayedReleaseAt ? { releaseAt: displayedReleaseAt } : event;
    if (/This event is yet to launch/i.test(body)) {
      if (await waitUntilRelease(releaseTarget)) return false;
      throw new Error("活动尚未发布；没有可用的未来开售时间可等待。");
    }
    const quantities = allVisible('input[type="number"]:not(:disabled)');
    if (quantities.length === 0) {
      if (/Sales start at/i.test(body)) {
        if (await waitUntilRelease(releaseTarget)) return false;
        throw new Error("票尚未开售；配置中没有可用的未来开售时间。");
      }
      if (/Sold out|Join waitlist/i.test(body)) throw new Error("当前没有可购买票种，可能已售罄。");
      throw new Error("没有找到可购买的数量控件。");
    }
    const invalidQuantities = quantities.filter((input) => ![0, 1].includes(Number(input.value)));
    if (invalidQuantities.length) throw new Error("检测到票数不是 0 或 1，已停止以避免重复购票。");
    const selectedQuantities = quantities.filter((input) => Number(input.value) === 1);
    if (selectedQuantities.length > 1) throw new Error("检测到多个票种各选了 1 张，请只保留一个后重试。");
    if (quantities.length > 1 && selectedQuantities.length === 0) {
      running = false;
      sessionStorage.removeItem(ACTIVE_KEY);
      quantities.forEach((input) => {
        let card = input;
        for (let depth = 0; depth < 5 && card.parentElement; depth += 1) card = card.parentElement;
        card.style.outline = "3px solid #f79009";
        card.style.outlineOffset = "2px";
      });
      quantities[0].scrollIntoView({ behavior: "smooth", block: "center" });
      manualChoiceButton.hidden = false;
      setStatus(`发现 ${quantities.length} 个可购买票种。请手动把其中一个选为 1 张，然后点“已选好，继续”。`, "error");
      return false;
    }

    const quantity = selectedQuantities[0] || quantities[0];

    if (event?.expectedPriceAud != null) {
      const price = findPriceNearQuantity(quantity);
      if (price !== event.expectedPriceAud) throw new Error(`价格检查失败：预期 $${event.expectedPriceAud}，页面为 ${price}。`);
    }

    const current = Number(quantity.value);
    if (current === 0) setNativeValue(quantity, "1");
    else if (current !== 1) throw new Error(`票数为 ${current}，不会自动修改。`);
    await sleep(150);
    const button = findButton(/^Continue$/i);
    if (!button) throw new Error("找不到 Continue 按钮。");
    setStatus("已选择 1 张票，进入资料页…");
    button.click();
    return true;
  }

  async function fillBuyer(config, profile) {
    setStatus("正在填写购买人资料…");
    const firstName = await waitFor(() => inputById("firstName"), "First Name");
    setNativeValue(firstName, profile.firstName);
    fillInputById("lastName", profile.lastName, true);
    fillInputById("email", profile.email, true);
    fillInputById("emailConfirmation", profile.email);
    fillInputById("mobile", profile.mobile, true);
    const zid = inputNearText("What's your zID? (If known)");
    if (zid) setNativeValue(zid, profile.zid);
    setCheckbox("humanitixMailListOptIn", Boolean(config.preferences.humanitixMarketing));
    setCheckbox("organiserMailListOptIn", Boolean(config.preferences.organiserMarketing));
    const unfilledRequired = allVisible("input[aria-required='true']").filter(
      (input) => input.type !== "checkbox" && !String(input.value || "").trim(),
    );
    if (unfilledRequired.length) {
      throw new Error(`还有 ${unfilledRequired.length} 个未识别的购买人必填字段，请手动填写后重新启动。`);
    }
    const nextStep = findButton(/^Continue to (?:Ticket info|Payment)$/i);
    if (nextStep) {
      nextStep.click();
      return true;
    }

    const ambiguousContinue = findButton(/^Continue$/i);
    if (ambiguousContinue) {
      ambiguousContinue.style.outline = "3px solid #f79009";
      ambiguousContinue.style.outlineOffset = "2px";
      ambiguousContinue.scrollIntoView({ behavior: "smooth", block: "center" });
      stop("资料已填写。这个 Continue 可能直接完成免费报名，请确认后手动点击。", "ok");
      return false;
    }
    throw new Error("找不到 Buyer information 的继续按钮。");
  }

  function comboboxByLabel(pattern) {
    return allVisible("[role='combobox']").find((combo) => {
      const labelledBy = combo.getAttribute("aria-labelledby");
      const label = labelledBy ? document.getElementById(labelledBy) : null;
      return pattern.test(normalize(label?.innerText || combo.getAttribute("aria-label")));
    });
  }

  async function chooseCombobox(pattern, value, required = true, alternatives = []) {
    const combo = comboboxByLabel(pattern);
    if (!combo) {
      if (required) throw new Error(`找不到必填学生信息：${pattern.source}`);
      return false;
    }
    if (combo.getAttribute("data-none-selected") !== "true") return true;
    combo.click();
    const acceptedValues = [value, ...alternatives].map(normalize);
    const option = await waitFor(
      () => allVisible("[role='option'], li, div")
        .filter((element) => acceptedValues.includes(normalize(element.innerText)))
        .at(-1),
      `选项 ${value}`,
      5000,
    );
    option.click();
    await waitFor(() => {
      const updated = comboboxByLabel(pattern);
      return updated && updated.getAttribute("data-none-selected") !== "true";
    }, `确认已选择 ${value}`, 5000);
    return true;
  }

  async function fillTicketInfo(config, profile) {
    setStatus("正在填写学生信息…");
    const hasStudentQuestion = await chooseCombobox(/Are you a UNSW Student/i, "Yes", false);
    if (hasStudentQuestion) {
      await waitFor(
        () =>
          inputNearPattern(/UNSW Student zID/i) ||
          comboboxByLabel(/Enrolment Type|What is your enrolment type/i),
        "选择 UNSW Student 后显示后续问题",
        5000,
      );
    }
    const ticketZid = inputNearPattern(/UNSW Student zID/i);
    if (ticketZid) setNativeValue(ticketZid, profile.zid);
    await chooseCombobox(
      /Enrolment Type|What is your enrolment type/i,
      profile.enrolmentType,
      true,
      [`${profile.enrolmentType} Student`],
    );
    await chooseCombobox(/Study Level|What is your level of study/i, profile.studyLevel);
    await chooseCombobox(/Full Time or Part Time|Study Load/i, profile.studyLoad, false);

    const unknownRequired = allVisible("[role='combobox'][aria-required='true']").filter(
      (combo) => combo.getAttribute("data-none-selected") === "true",
    );
    if (unknownRequired.length) {
      throw new Error(`还有 ${unknownRequired.length} 个未识别的必填选项，请手动填写后重新启动。`);
    }
    const unknownRequiredInputs = allVisible("input[aria-required='true']").filter(
      (input) => input.type !== "checkbox" && !String(input.value || "").trim(),
    );
    if (unknownRequiredInputs.length) {
      throw new Error(`还有 ${unknownRequiredInputs.length} 个未识别的 Ticket info 必填字段，请手动填写后重新启动。`);
    }

    if (!config.preferences.acceptArcTerms) throw new Error("配置未同意 Arc 条款，已停止。");
    const terms = checkboxNearText(/I have read and agree to the Arc@UNSW Event/i);
    if (!(terms instanceof HTMLInputElement)) throw new Error("找不到 Arc 条款复选框。");
    if (!terms.checked) terms.parentElement.click();

    if (profile.accessibilityRequirements) {
      const accessibility = inputNearText("Do you have any accessibility requirements?");
      if (accessibility) setNativeValue(accessibility, profile.accessibilityRequirements);
    }

    const button = findButton(/^Continue(?: to Payment)?$/i);
    if (!button) throw new Error("找不到 Ticket info 的 Continue 按钮。");
    button.click();
  }

  async function handlePayment(config) {
    setStatus("已进入付款区，正在选择付款方式…");
    const methodPatterns = {
      "google-pay": /^Google Pay$/i,
      "apple-pay": /^Apple Pay$/i,
      "credit-card": /Credit Card/i,
      paypal: /^PayPal$/i,
      none: null,
    };
    const methodLabels = {
      "google-pay": "Google Pay",
      "apple-pay": "Apple Pay",
      "credit-card": "Credit Card",
      paypal: "PayPal",
      none: "付款页面",
    };
    const pattern = methodPatterns[config.payment.method];
    if (pattern) {
      const method = findPaymentControl(pattern);
      if (!method) throw new Error(`找不到付款方式：${config.payment.method}`);
      const details = method.closest("details");
      if (!details?.open) method.click();
    }
    if (!config.payment.openPaymentSheet) {
      stop("已停在付款页面。", "ok");
      return;
    }
    const exact = normalize(config.payment.checkoutButtonText);
    const checkout = allVisible("button, [role='button']").filter((element) => {
      const name = normalize(element.innerText || element.getAttribute("aria-label"));
      return exact ? name === exact : /^Checkout with\b/i.test(name);
    });
    if (checkout.length !== 1) throw new Error(`Checkout with… 按钮数量为 ${checkout.length}，已停止。`);
    running = false;
    sessionStorage.removeItem(ACTIVE_KEY);
    const methodLabel = methodLabels[config.payment.method] || config.payment.method;
    paymentActionButton.textContent = `打开 ${methodLabel}`;
    paymentActionButton.hidden = false;
    paymentActionButton.onclick = () => {
      const currentCheckout = allVisible("button, [role='button']").filter((element) => {
        const name = normalize(element.innerText || element.getAttribute("aria-label"));
        return exact ? name === exact : /^Checkout with\b/i.test(name);
      });
      if (currentCheckout.length !== 1) {
        stop(`Checkout with… 按钮数量为 ${currentCheckout.length}，已停止。`);
        return;
      }
      currentCheckout[0].click();
      paymentActionButton.hidden = true;
      setStatus("已请求打开付款窗口；最终继续或付款仍需手动确认。", "ok");
    };
    setStatus(`${methodLabel} 已就绪。请亲手点击下方“打开 ${methodLabel}”；浏览器可能要求这一步必须是用户手势。`, "ok");
  }

  async function run() {
    if (running) return;
    running = true;
    const config = loadConfig();
    const profile = config.profiles[config.selectedProfile];
    let path = location.pathname;

    if (/\/tickets\/?$/.test(path)) {
      const advancing = await handleTicketPage(config);
      if (!advancing) return;
      await waitFor(() => inputById("firstName"), "Buyer information", 20000);
      path = location.pathname;
    }
    if (!/\/au\/[^/]+\/details\/?$/.test(path)) {
      setStatus("正在打开票务页…");
      location.href = `${normalizeEventUrl()}/tickets`;
      return;
    }

    const buyer = inputById("firstName");
    if (buyer) {
      const advancing = await fillBuyer(config, profile);
      if (!advancing) return;
      await waitFor(() => !inputById("firstName"), "下一步", 15000);
    }
    if (findButton(/^Continue(?: to Payment)?$/i)) {
      await fillTicketInfo(config, profile);
      await waitFor(() => findPaymentControl(/^Google Pay$|^Apple Pay$|Credit Card|^PayPal$/i), "Payment", 15000);
    }
    await handlePayment(config);
  }

  function editConfigJson() {
    const current = JSON.stringify(loadConfig(), null, 2);
    const edited = prompt("编辑配置 JSON。个人资料只保存在 Tampermonkey 存储中。", current);
    if (edited == null) return;
    try {
      const parsed = JSON.parse(edited);
      saveConfig(parsed);
      setStatus("配置已保存。", "ok");
    } catch (error) {
      alert(`JSON 无效：${error.message}`);
    }
  }

  function openSetup() {
    document.getElementById("humanitix-assistant-setup")?.remove();
    const config = loadConfig();
    const profile = config.profiles?.[config.selectedProfile] || structuredClone(DEFAULT_CONFIG.profiles.me);
    const overlay = document.createElement("div");
    overlay.id = "humanitix-assistant-setup";
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483647", "display:flex", "align-items:center",
      "justify-content:center", "padding:20px", "background:rgba(15,23,42,.66)",
      "font:14px/1.45 system-ui,sans-serif",
    ].join(";");
    overlay.innerHTML = `
      <form data-form style="width:min(560px,100%);max-height:92vh;overflow:auto;background:#fff;color:#101828;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.35)">
        <h2 style="margin:0 0 6px;font-size:22px">Humanitix 助手首次设置</h2>
        <p style="margin:0 0 18px;color:#475467">资料只保存在本机 Tampermonkey 存储中，不会上传到项目或第三方服务器。</p>
        <div data-fields style="display:grid;grid-template-columns:1fr 1fr;gap:12px"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px">
          <label>学生类型<select name="enrolmentType"><option>International</option><option>Domestic</option></select></label>
          <label>学习阶段<select name="studyLevel"><option>Postgraduate</option><option>Undergraduate</option></select></label>
          <label>学习状态<select name="studyLoad"><option>Full-Time</option><option>Part-Time</option></select></label>
        </div>
        <label style="display:block;margin-top:12px">首选付款方式
          <select name="paymentMethod" style="display:block;width:100%;margin-top:4px">
            <option value="google-pay">Google Pay</option>
            <option value="apple-pay">Apple Pay</option>
            <option value="credit-card">Credit Card</option>
            <option value="paypal">PayPal</option>
            <option value="none">只停在付款页</option>
          </select>
        </label>
        <label style="display:block;margin-top:14px"><input name="autoStart" type="checkbox"> 已配置开售时间的活动自动倒计时</label>
        <label style="display:block;margin-top:8px"><input name="humanitixMarketing" type="checkbox"> 接收 Humanitix 推广邮件</label>
        <div data-error style="min-height:20px;margin-top:10px;color:#b42318;font-weight:700"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
          <button data-cancel type="button">取消</button>
          <button type="submit" style="background:#111827;color:#fff;font-weight:700">保存资料</button>
        </div>
      </form>`;
    const fields = [
      ["firstName", "First Name", "text"], ["lastName", "Last Name", "text"],
      ["email", "Email", "email"], ["mobile", "Mobile", "tel"], ["zid", "zID", "text"],
    ];
    const fieldsHost = overlay.querySelector("[data-fields]");
    for (const [name, label, type] of fields) {
      const wrapper = document.createElement("label");
      wrapper.textContent = label;
      const input = document.createElement("input");
      input.name = name;
      input.type = type;
      input.required = true;
      input.value = profile[name] || "";
      input.style.cssText = "display:block;width:100%;margin-top:4px;padding:9px;border:1px solid #d0d5dd;border-radius:8px";
      wrapper.appendChild(input);
      fieldsHost.appendChild(wrapper);
    }
    overlay.querySelectorAll("select,button").forEach((element) => {
      element.style.padding = "9px";
      element.style.border = "1px solid #d0d5dd";
      element.style.borderRadius = "8px";
    });
    const form = overlay.querySelector("[data-form]");
    form.elements.enrolmentType.value = profile.enrolmentType || "International";
    form.elements.studyLevel.value = profile.studyLevel || "Postgraduate";
    form.elements.studyLoad.value = profile.studyLoad || "Full-Time";
    form.elements.paymentMethod.value = config.payment?.method || "google-pay";
    form.elements.autoStart.checked = config.preferences?.autoStartScheduledEvents !== false;
    form.elements.humanitixMarketing.checked = Boolean(config.preferences?.humanitixMarketing);
    overlay.querySelector("[data-cancel]").addEventListener("click", () => overlay.remove());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const email = String(data.get("email") || "").trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        overlay.querySelector("[data-error]").textContent = "请输入有效邮箱。";
        return;
      }
      const next = loadConfig();
      const selected = next.selectedProfile || "me";
      next.profiles ||= {};
      next.profiles[selected] = {
        ...(next.profiles[selected] || {}),
        firstName: String(data.get("firstName") || "").trim(),
        lastName: String(data.get("lastName") || "").trim(),
        email,
        mobile: String(data.get("mobile") || "").trim(),
        zid: String(data.get("zid") || "").trim(),
        enrolmentType: String(data.get("enrolmentType") || "International"),
        studyLevel: String(data.get("studyLevel") || "Postgraduate"),
        studyLoad: String(data.get("studyLoad") || "Full-Time"),
        accessibilityRequirements: next.profiles[selected]?.accessibilityRequirements || "",
      };
      next.preferences ||= {};
      next.preferences.autoStartScheduledEvents = form.elements.autoStart.checked;
      next.preferences.humanitixMarketing = form.elements.humanitixMarketing.checked;
      next.preferences.organiserMarketing = false;
      next.preferences.acceptArcTerms = true;
      next.payment ||= {};
      next.payment.method = String(data.get("paymentMethod") || "google-pay");
      next.payment.openPaymentSheet = ["google-pay", "apple-pay"].includes(next.payment.method);
      next.payment.checkoutButtonText ||= "";
      saveConfig(next);
      overlay.remove();
      setStatus("资料已保存，可以启动当前活动。", "ok");
    });
    document.documentElement.appendChild(overlay);
    form.elements.firstName.focus();
  }

  function createPanel() {
    panel = document.createElement("div");
    panel.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:2147483647", "width:280px",
      "padding:12px", "border:1px solid #d0d5dd", "border-radius:12px", "background:#fff",
      "box-shadow:0 8px 28px rgba(16,24,40,.18)", "font:13px/1.4 system-ui,sans-serif",
    ].join(";");
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">Humanitix 助手</div>
      <div data-status style="min-height:36px;color:#344054;margin-bottom:8px">等待启动。</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button data-start type="button">启动当前活动</button>
        <button data-stop type="button">停止</button>
        <button data-config type="button">设置</button>
        <button data-choice type="button" hidden style="background:#f79009;color:#111827;font-weight:700">已选好，继续</button>
        <button data-payment type="button" hidden style="background:#111827;color:#fff;font-weight:700">打开 Google Pay</button>
      </div>`;
    document.documentElement.appendChild(panel);
    statusNode = panel.querySelector("[data-status]");
    paymentActionButton = panel.querySelector("[data-payment]");
    manualChoiceButton = panel.querySelector("[data-choice]");
    panel.querySelector("[data-start]").addEventListener("click", start);
    panel.querySelector("[data-stop]").addEventListener("click", () => stop("已由用户停止。", "normal"));
    panel.querySelector("[data-config]").addEventListener("click", openSetup);
    manualChoiceButton.addEventListener("click", () => {
      manualChoiceButton.hidden = true;
      start();
    });
  }

  GM_registerMenuCommand("编辑 Humanitix 助手资料", openSetup);
  GM_registerMenuCommand("高级：编辑完整 JSON 配置", editConfigJson);
  GM_registerMenuCommand("启动当前 Humanitix 活动", start);
  createPanel();

  if (!hasCompleteProfile(loadConfig())) {
    setStatus("首次使用：请填写个人资料。", "error");
    setTimeout(openSetup, 0);
  }

  if (sessionStorage.getItem(ACTIVE_KEY) === "1") {
    running = false;
    start();
  } else {
    const config = loadConfig();
    const event = configuredEvent(config);
    const displayedReleaseAt = extractNextReleaseAt(normalize(document.body?.innerText));
    const releaseTime = displayedReleaseAt
      ? new Date(displayedReleaseAt).getTime()
      : event?.releaseAt
        ? new Date(event.releaseAt).getTime()
        : NaN;
    if (
      config.preferences?.autoStartScheduledEvents &&
      Number.isFinite(releaseTime) &&
      releaseTime > Date.now()
    ) {
      setStatus("检测到已配置的未来开售时间，正在自动进入倒计时…", "ok");
      start();
    }
  }
})();
