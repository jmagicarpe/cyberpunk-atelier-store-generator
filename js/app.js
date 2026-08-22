const en = {
  title: "Virtual Atelier Generator",
  settings: {
    storeId: "Store ID",
    storeName: "Store Name",
    atlas: "Icon Atlas",
    slot: "Icon Slot",
    price: "Price",
    quantity: "Quantity",
    defaultQuality: "Default Quality",
  },
};

const SAMPLE = `Items.tiopayo_tyo-04_-_chains_\${base_color}:
  $base: Items.Outfit
  $instances:
    - { base_color: silver, icon: slot_01 }
    - { base_color: gold, icon: slot_02 }
    - { base_color: black, icon: slot_03 }
  appearanceName: tyo-04_-_chains_!\${base_color}
  entityName: tyo-04_-_chains_factory_name
  localizedDescription: LocKey#tyo-04_-_chains_i18n_desc
  displayName: LocKey#tyo-04_-_chains_i18n_\${base_color}
  quality: Quality.Legendary
  icon:
    atlasResourcePath: tiopayo\\tyo-04-lingerie\\tyo-04_-_bra\\tyo-04_-_chains_icons.inkatlas
    atlasPartName: tyo-04_-_chains_\${base_color}
  appearanceSuffixes: []
  placementSlots:
    - !append-once OutfitSlots.LegsOuter`;

const SAMPLE_ATELIER = `@addMethod(gameuiInGameMenuGameController)
protected cb func RegisterTIOPAYOTYOSTOREStore(event: ref<VirtualShopRegistration>) -> Bool {
  event.AddStore(
    n"TIOPAYOTYOSTORE",
    "TYO - Store",
    ["Items.tiopayo_tyo-04_-_chains_silver", "Items.tiopayo_tyo-04_-_chains_gold", "Items.tiopayo_tyo-04_-_chains_black"],
    [0, 0, 0],
    r"tiopayo/tyo-store/tyo-store_icons.inkatlas",
    n"slot_01",
    ["Legendary", "Legendary", "Legendary"],
    [1, 1, 1]
  );
}`;

let baseStore = null;

const els = {
  storeId: document.getElementById("storeId"),
  storeName: document.getElementById("storeName"),
  atlas: document.getElementById("atlas"),
  slot: document.getElementById("slot"),
  price: document.getElementById("price"),
  quantity: document.getElementById("quantity"),
  defaultQuality: document.getElementById("defaultQuality"),
  input: document.getElementById("input"),
  output: document.getElementById("output"),
  itemCount: document.getElementById("itemCount"),
  status: document.getElementById("status"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  inventorySort: document.getElementById("inventorySort"),
  inventoryOutput: document.getElementById("inventoryOutput"),
  inventoryCount: document.getElementById("inventoryCount"),
  copyInventoryBtn: document.getElementById("copyInventoryBtn"),
  downloadInventoryBtn: document.getElementById("downloadInventoryBtn"),
  loadSample: document.getElementById("loadSample"),
  loadAtelierSample: document.getElementById("loadAtelierSample"),
  clearInput: document.getElementById("clearInput"),
  importBtn: document.getElementById("importBtn"),
  clearBase: document.getElementById("clearBase"),
  redsFile: document.getElementById("redsFile"),
  baseImport: document.getElementById("baseImport"),
  baseMeta: document.getElementById("baseMeta"),
};

function parseInstanceVars(raw) {
  const vars = {};
  raw.split(",").forEach((pair) => {
    const idx = pair.indexOf(":");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key && value) vars[key] = value;
  });
  return vars;
}

function expandTemplate(template, vars) {
  return template.replace(/\$\{([^}]+)\}|\$\(([^)]+)\)/g, (match, braceKey, parenKey) => {
    const key = (braceKey || parenKey).trim();
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

function hasPlaceholders(template) {
  return /\$\{[^}]+\}|\$\([^)]+\)/.test(template || "");
}

function extractColorFromId(id) {
  const name = String(id || "").replace(/^Items\./, "");
  const parts = name.split("_").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function colorFromVars(vars) {
  return vars.base_color || vars.color || vars.colour || vars.tint || vars.attribute || "";
}

function flushBlock(items, block, defaultQuality) {
  if (!block.template) return;

  const quality = block.quality || defaultQuality;

  if (hasPlaceholders(block.template) && block.instances.length) {
    block.instances.forEach((vars) => {
      const id = expandTemplate(block.template, vars);
      items.push({
        id,
        quality,
        color: colorFromVars(vars) || extractColorFromId(id),
      });
    });
    return;
  }

  if (!hasPlaceholders(block.template)) {
    items.push({ id: block.template, quality, color: extractColorFromId(block.template) });
  }
}

function parseInventoryComments(yaml, defaultQuality) {
  const items = [];
  const seen = new Set();
  yaml.split(/\r?\n/).forEach((line) => {
    const inventory = line.match(/Game\.AddToInventory\(\s*"([^"]+)"/);
    if (!inventory || seen.has(inventory[1])) return;
    seen.add(inventory[1]);
    items.push({
      id: inventory[1],
      quality: defaultQuality,
      color: extractColorFromId(inventory[1]),
    });
  });
  return items;
}

function parseItems(yaml, defaultQuality) {
  const items = [];
  const seen = new Set();
  let block = { template: null, instances: [], quality: null, inInstances: false };

  yaml.split(/\r?\n/).forEach((line) => {
    const itemDef = line.match(/^(Items\.[^\s:]+)\s*:/);
    if (itemDef) {
      flushBlock(items, block, defaultQuality);
      block = { template: itemDef[1], instances: [], quality: null, inInstances: false };
      return;
    }

    if (/^\s*\$instances\s*:/.test(line)) {
      block.inInstances = true;
      return;
    }

    if (block.inInstances) {
      if (/^\s*$/.test(line) || /^\s*#/.test(line)) return;
      const instance = line.match(/^\s+-\s*\{([^}]*)\}/);
      if (instance) {
        block.instances.push(parseInstanceVars(instance[1]));
        return;
      }
      block.inInstances = false;
    }

    const quality = line.match(/^\s*quality:\s*Quality\.(\w+)/);
    if (quality) block.quality = quality[1];
  });

  flushBlock(items, block, defaultQuality);

  const unique = items.filter((item) => {
    if (!item.id || hasPlaceholders(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return unique.length ? unique : parseInventoryComments(yaml, defaultQuality);
}

function formatArray(values, quote) {
  return `[${values.map((value) => (quote ? `"${value}"` : String(value))).join(", ")}]`;
}

function sanitizeStoreId(value) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function extractBalanced(source, openIdx, openCh, closeCh) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return source.slice(openIdx + 1, i);
    }
  }
  return null;
}

function splitTopLevel(body) {
  const parts = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (const ch of body) {
    if (inString) {
      current += ch;
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; current += ch; continue; }
    if (ch === "[" || ch === "(") { depth++; current += ch; continue; }
    if (ch === "]" || ch === ")") { depth--; current += ch; continue; }
    if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseStringArg(raw) {
  const match = String(raw || "").trim().match(/^[nr]?"((?:\\.|[^"\\])*)"/i);
  return match ? match[1].replace(/\\"/g, '"') : "";
}

function parseValueArray(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed.startsWith("[")) return [];
  const close = trimmed.lastIndexOf("]");
  if (close <= 0) return [];
  return splitTopLevel(trimmed.slice(1, close)).map((part) => {
    const asString = parseStringArg(part);
    if (asString || /^\s*[nr]?"/i.test(part)) return asString;
    const asNumber = Number(part.trim());
    return Number.isFinite(asNumber) ? asNumber : part.trim();
  });
}

function normalizeQuality(value) {
  return String(value || "").replace(/^Quality\./, "").trim();
}

function stripRedsComments(source) {
  let out = "";
  let inString = false;
  let escape = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLine) {
      if (ch === "\n") { inLine = false; out += ch; }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") { inBlock = false; i++; }
      continue;
    }
    if (inString) {
      out += ch;
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === "/" && next === "/") { inLine = true; i++; continue; }
    if (ch === "/" && next === "*") { inBlock = true; i++; continue; }
    out += ch;
  }

  return out;
}

function parseAtelierStore(source) {
  source = stripRedsComments(source);
  const addStoreIdx = source.search(/AddStore\s*\(/);
  if (addStoreIdx === -1) return null;

  const parenIdx = source.indexOf("(", addStoreIdx);
  const body = extractBalanced(source, parenIdx, "(", ")");
  if (!body) return null;

  const args = splitTopLevel(body);
  if (args.length < 3) return null;

  const ids = parseValueArray(args[2]).map(String).filter(Boolean);
  const prices = args[3] ? parseValueArray(args[3]) : [];
  const qualities = args[6] ? parseValueArray(args[6]) : [];
  const quantities = args[7] ? parseValueArray(args[7]) : [];

  const items = [];
  const seen = new Set();
  ids.forEach((id, index) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    items.push({
      id,
      quality: normalizeQuality(qualities[index]) || null,
      price: Number.isFinite(Number(prices[index])) ? Number(prices[index]) : null,
      quantity: Number.isFinite(Number(quantities[index])) ? Number(quantities[index]) : null,
      color: extractColorFromId(id),
    });
  });

  return {
    storeId: parseStringArg(args[0]),
    storeName: parseStringArg(args[1]),
    atlas: args[4] ? parseStringArg(args[4]).replace(/\\/g, "/") : "",
    slot: args[5] ? parseStringArg(args[5]) : "",
    items,
  };
}

function applyAtelierSettings(store) {
  if (!store) return;
  if (store.storeId) els.storeId.value = store.storeId;
  if (store.storeName) els.storeName.value = store.storeName;
  if (store.atlas) els.atlas.value = store.atlas;
  if (store.slot) els.slot.value = store.slot;
}

function setBaseStore(store, filename) {
  baseStore = store ? { ...store, filename: filename || store.filename || "store.reds" } : null;
  if (baseStore) {
    const count = baseStore.items.length;
    const countLabel = count <= 1 ? `${count} item` : `${count} items`;
    els.baseMeta.innerHTML = `Base : <strong>${baseStore.filename}</strong> · ${countLabel}`;
  } else {
    els.baseMeta.textContent = "Aucun store .reds importé — le YAML créera un store neuf.";
  }
}

function mergeItems(baseItems, yamlItems, price, quantity, defaultQuality) {
  const seen = new Set(baseItems.map((item) => item.id));
  const added = [];

  yamlItems.forEach((item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    added.push({
      id: item.id,
      color: item.color,
      quality: item.quality || defaultQuality,
      price,
      quantity,
    });
  });

  return {
    items: baseItems.concat(added),
    added,
  };
}

const COLOR_NOISE = new Set(["mesh", "v1", "v2", "v3", "v4", "v5"]);

function colorTokens(value) {
  return String(value || "")
    .toLowerCase()
    .split(/_+/g)
    .filter((token) => token && !COLOR_NOISE.has(token));
}

function itemColorSource(item) {
  return item.color || extractColorFromId(item.id);
}

function assignColorGroups(items) {
  const tokenized = items.map((item) => colorTokens(itemColorSource(item)));
  const prefixCount = {};

  tokenized.forEach((tokens) => {
    const prefix = tokens[0];
    if (!prefix) return;
    prefixCount[prefix] = (prefixCount[prefix] || 0) + 1;
  });

  const materials = new Set(
    Object.keys(prefixCount).filter((token) => prefixCount[token] >= 2)
  );

  const rawKeys = tokenized.map((tokens) => {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (!materials.has(tokens[i])) return tokens[i];
    }
    return tokens[tokens.length - 1] || "";
  });

  const keyCount = {};
  rawKeys.forEach((key) => {
    keyCount[key] = (keyCount[key] || 0) + 1;
  });

  return rawKeys.map((key, index) => {
    const prefix = tokenized[index][0];
    const prefixSize = prefixCount[prefix] || 0;
    if (keyCount[key] === 1 && prefix && materials.has(prefix) && prefixSize <= 5) {
      return prefix;
    }
    return key;
  });
}

function formatInventory(items, quantity, sortMode) {
  const list = items.map((item, index) => ({ ...item, index }));

  if (sortMode === "color") {
    const groups = assignColorGroups(list);
    list.forEach((item, index) => {
      item.colorGroup = groups[index];
    });
    list.sort((a, b) => {
      const groupCmp = (a.colorGroup || "").localeCompare(b.colorGroup || "", "fr", { sensitivity: "base" });
      if (groupCmp !== 0) return groupCmp;
      const idCmp = a.id.localeCompare(b.id, "fr", { sensitivity: "base" });
      return idCmp !== 0 ? idCmp : a.index - b.index;
    });
  }

  const lines = [];
  let lastGroup = null;

  list.forEach((item) => {
    const group = sortMode === "color" ? item.colorGroup : null;
    if (sortMode === "color" && lastGroup !== null && group !== lastGroup) {
      lines.push("");
    }
    lastGroup = group;
    lines.push(`Game.AddToInventory("${item.id}", ${quantity})`);
  });

  return lines.join("\n");
}

function generate() {
  const storeId = sanitizeStoreId(els.storeId.value.trim());
  const storeName = els.storeName.value.trim();
  const atlas = els.atlas.value.trim().replace(/\\/g, "/");
  const slot = els.slot.value.trim();
  const price = Number(els.price.value || 0);
  const quantity = Number(els.quantity.value || 1);
  const defaultQuality = els.defaultQuality.value.trim() || "Legendary";
  const yamlItems = parseItems(els.input.value, defaultQuality);
  const baseItems = baseStore ? baseStore.items.slice() : [];
  const merged = mergeItems(baseItems, yamlItems, price, quantity, defaultQuality);
  const items = merged.items;
  const added = merged.added;
  const inventoryItems = added.length ? added : items;
  const sortMode = els.inventorySort.value;

  els.itemCount.textContent = items.length <= 1 ? `${items.length} item` : `${items.length} items`;
  els.inventoryCount.textContent = inventoryItems.length <= 1
    ? `${inventoryItems.length} commande`
    : `${inventoryItems.length} commandes`;

  if (!storeId) {
    els.output.value = "";
    els.inventoryOutput.value = "";
    els.status.textContent = "Indique un ID de store (lettres et chiffres uniquement).";
    els.status.className = "hint error";
    return;
  }

  if (!items.length) {
    els.output.value = "";
    els.inventoryOutput.value = "";
    els.status.textContent = "Aucun item trouvé. Importe un store .reds et / ou colle un YAML d'items.";
    els.status.className = "hint error";
    return;
  }

  const ids = items.map((item) => item.id);
  const prices = items.map((item) => (item.price != null ? item.price : price));
  const qualities = items.map((item) => item.quality || defaultQuality);
  const quantities = items.map((item) => (item.quantity != null ? item.quantity : quantity));
  const methodName = `Register${storeId}Store`;

  els.output.value = [
    "@addMethod(gameuiInGameMenuGameController)",
    `protected cb func ${methodName}(event: ref<VirtualShopRegistration>) -> Bool {`,
    "  event.AddStore(",
    `    n"${storeId}",`,
    `    "${storeName.replace(/"/g, '\\"')}",`,
    `    ${formatArray(ids, true)},`,
    `    ${formatArray(prices, false)},`,
    `    r"${atlas}",`,
    `    n"${slot}",`,
    `    ${formatArray(qualities, true)},`,
    `    ${formatArray(quantities, false)}`,
    "  );",
    "}",
  ].join("\n");

  els.inventoryOutput.value = formatInventory(inventoryItems, quantity, sortMode);

  if (baseStore && added.length) {
    els.status.textContent = `${added.length} item(s) ajoutés à ${baseItems.length} existants (${items.length} au total).`;
  } else if (baseStore) {
    els.status.textContent = `Store de base conservé : ${items.length} item(s). Aucun nouvel item YAML.`;
  } else {
    els.status.textContent = `${items.length} item(s) générés depuis le YAML pour ${storeId}.`;
  }
  els.status.className = "hint";
}

function importRedsText(text, filename) {
  const parsed = parseAtelierStore(text);
  if (!parsed) {
    els.status.textContent = "Fichier .reds invalide : aucun event.AddStore trouvé.";
    els.status.className = "hint error";
    return;
  }
  applyAtelierSettings(parsed);
  setBaseStore(parsed, filename);
  generate();
}

function importRedsFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => importRedsText(String(reader.result || ""), file.name);
  reader.readAsText(file);
}

[
  els.storeId, els.storeName, els.atlas, els.slot,
  els.price, els.quantity, els.defaultQuality, els.input, els.inventorySort,
].forEach((el) => el.addEventListener("input", generate));
els.inventorySort.addEventListener("change", generate);

els.loadSample.addEventListener("click", () => {
  els.input.value = SAMPLE;
  generate();
});

els.clearInput.addEventListener("click", () => {
  els.input.value = "";
  generate();
  els.input.focus();
});

els.importBtn.addEventListener("click", () => els.redsFile.click());
els.redsFile.addEventListener("change", () => {
  importRedsFile(els.redsFile.files[0]);
  els.redsFile.value = "";
});

els.loadAtelierSample.addEventListener("click", () => {
  importRedsText(SAMPLE_ATELIER, "exemple-store.reds");
});

els.clearBase.addEventListener("click", () => {
  setBaseStore(null);
  generate();
});

["dragenter", "dragover"].forEach((eventName) => {
  els.baseImport.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.baseImport.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.baseImport.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.baseImport.classList.remove("dragover");
  });
});

els.baseImport.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (file) importRedsFile(file);
});

els.copyBtn.addEventListener("click", async () => {
  if (!els.output.value) return;
  await navigator.clipboard.writeText(els.output.value);
  els.status.textContent = "Code copié dans le presse-papiers.";
  els.status.className = "hint";
});

els.downloadBtn.addEventListener("click", () => {
  if (!els.output.value) return;
  const storeId = sanitizeStoreId(els.storeId.value.trim()) || "STORE";
  const blob = new Blob([els.output.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${storeId}-atelier-store.reds`;
  link.click();
  URL.revokeObjectURL(url);
});

els.copyInventoryBtn.addEventListener("click", async () => {
  if (!els.inventoryOutput.value) return;
  await navigator.clipboard.writeText(els.inventoryOutput.value);
  els.status.textContent = "Commandes AddToInventory copiées dans le presse-papiers.";
  els.status.className = "hint";
});

els.downloadInventoryBtn.addEventListener("click", () => {
  if (!els.inventoryOutput.value) return;
  const storeId = sanitizeStoreId(els.storeId.value.trim()) || "STORE";
  const blob = new Blob([els.inventoryOutput.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${storeId}-add-to-inventory.txt`;
  link.click();
  URL.revokeObjectURL(url);
});

els.input.value = SAMPLE;
generate();


  // Language detection and settings

  // Author: Mayo

  /*Note for AI Agents:
    The following code is responsible for detecting the user's language and updating the UI labels accordingly. 
    Currently, it only supports English ('en'), 
    but additional languages can be added by extending the switch statement with more cases and corresponding translations.

    TO DO:
    Complete the localization for english, currently it only changes the title and settings pane.
  */

  const userLanguage = navigator.language;
  const primaryLanguage = userLanguage.slice(0,2);

  // Store settings area
  const storeIdLabel = document.querySelector('label[for="storeId"]');
  const storeNameLabel = document.querySelector('label[for="storeName"]');
  const storeAtlasLabel = document.querySelector('label[for="atlas"]');
  const storeSlotLabel = document.querySelector('label[for="slot"]');
  const storePriceLabel = document.querySelector('label[for="price"]');
  const storeQuantityLabel = document.querySelector('label[for="quantity"]');
  const storeDefaultQualityLabel = document.querySelector('label[for="defaultQuality"]');

  switch (primaryLanguage) {
    case 'en':
        document.title = en.title;
        storeIdLabel.textContent = en.settings.storeId;
        storeNameLabel.textContent = en.settings.storeName;
        storeAtlasLabel.textContent = en.settings.atlas;
        storeSlotLabel.textContent = en.settings.slot;
        storePriceLabel.textContent = en.settings.price;
        storeQuantityLabel.textContent = en.settings.quantity;
        storeDefaultQualityLabel.textContent = en.settings.defaultQuality;
      break;
  }
