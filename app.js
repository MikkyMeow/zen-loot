const CELL_FALLBACK = 38;
const crateConfig = {
  columns: 10,
  rows: 5,
};

const storageCrate = {
  id: "wooden-crate",
  name: "Побитый деревянный ящик",
  icon: "🧳",
  canNest: true,
  nestedSize: { w: crateConfig.columns, h: crateConfig.rows },
  size: { w: crateConfig.columns, h: crateConfig.rows },
  items: [],
};

const nearbyLoot = [
  createLoot("hunter-pack", "Охотничий рюкзак", "🎒", { w: 3, h: 4 }, true, {
    w: 5,
    h: 4,
  }),
  createLoot("akm", "АКМ", "🔫", { w: 3, h: 1 }, false),
  createLoot("canteen", "Армейская фляга", "🥤", { w: 1, h: 2 }, false),
  createLoot("beans", "Консервы фасоли", "🥫", { w: 1, h: 1 }, false),
  createLoot("medkit", "Тактическая аптечка", "🩹", { w: 2, h: 2 }, false),
];

let crateGridEl;
let cellSize = CELL_FALLBACK;
let crateItemCounter = 0;

const DRAG_PAYLOAD_TYPE = "application/zenloot-payload";

function createLoot(id, name, icon, size, canNest, nestedSize = null) {
  return {
    id,
    name,
    icon,
    size,
    canNest,
    nestedSize: canNest ? nestedSize : null,
  };
}

function setDragPayload(event, payload) {
  const serialized = JSON.stringify(payload);
  event.dataTransfer.setData(DRAG_PAYLOAD_TYPE, serialized);
  event.dataTransfer.setData("text/plain", serialized);
  event.dataTransfer.effectAllowed = "move";
}

function parseDragPayload(event) {
  const data =
    event.dataTransfer.getData(DRAG_PAYLOAD_TYPE) ||
    event.dataTransfer.getData("text/plain");

  if (!data) return null;

  try {
    const payload = JSON.parse(data);
    if (payload && payload.id) {
      return {
        ...payload,
        anchor: normalizeAnchor(payload.anchor),
      };
    }
  } catch (_) {
    return {
      source: "nearby",
      id: data,
      anchor: { col: 0, row: 0 },
    };
  }

  return null;
}

function normalizeAnchor(anchor) {
  if (!anchor || typeof anchor.col !== "number" || typeof anchor.row !== "number") {
    return { col: 0, row: 0 };
  }
  return {
    col: Math.max(0, Math.floor(anchor.col)),
    row: Math.max(0, Math.floor(anchor.row)),
  };
}

function createStoredItem(loot, position) {
  return {
    ...loot,
    position,
    instanceId: `crate-item-${crateItemCounter++}`,
  };
}

function initLootInterface() {
  const rootStyles = getComputedStyle(document.documentElement);
  const cssCellSize = parseInt(rootStyles.getPropertyValue("--cell-size"), 10);
  if (!Number.isNaN(cssCellSize)) {
    cellSize = cssCellSize;
  }
  renderNearbyLoot();
  buildCrate();
}

function renderNearbyLoot() {
  const container = document.getElementById("dragContainer");
  if (!container) return;

  container.innerHTML = "";

  const label = document.createElement("span");
  label.className = "zone-label";
  label.textContent = "Поблизости";
  container.appendChild(label);

  const list = document.createElement("div");
  list.className = "nearby-list";
  container.appendChild(list);

  nearbyLoot.forEach((loot) => {
    const card = document.createElement("div");
    card.className = "loot-card";
    card.draggable = true;
    card.dataset.lootId = loot.id;

    card.addEventListener("dragstart", (event) => handleNearbyDragStart(event, loot));
    card.addEventListener("dragend", () => card.classList.remove("is-dragging"));

    const icon = document.createElement("span");
    icon.className = "loot-card-icon";
    icon.textContent = loot.icon;

    const meta = document.createElement("div");
    meta.className = "loot-card-meta";

    const nameEl = document.createElement("span");
    nameEl.className = "loot-card-name";
    nameEl.textContent = loot.name;

    const sizeEl = document.createElement("span");
    sizeEl.className = "loot-card-size";
    sizeEl.textContent = `${loot.size.w}×${loot.size.h}`;

    meta.append(nameEl, sizeEl);
    card.append(icon, meta);
    list.appendChild(card);
  });

  if (!nearbyLoot.length) {
    const empty = document.createElement("span");
    empty.className = "zone-label";
    empty.textContent = "— пусто —";
    container.appendChild(empty);
  }
}

function handleNearbyDragStart(event, loot) {
  setDragPayload(event, {
    source: "nearby",
    id: loot.id,
    anchor: { col: 0, row: 0 },
  });
  event.currentTarget.classList.add("is-dragging");
}

function handleCrateTileDragStart(event, lootItem) {
  const anchor = getTileAnchor(event, lootItem);
  setDragPayload(event, {
    source: "crate",
    id: lootItem.instanceId || lootItem.id,
    anchor,
  });
  event.currentTarget.classList.add("is-dragging");
}

function getTileAnchor(event, lootItem) {
  if (!lootItem) {
    return { col: 0, row: 0 };
  }

  const localX = "offsetX" in event ? event.offsetX : 0;
  const localY = "offsetY" in event ? event.offsetY : 0;
  const col = clampAnchorIndex(localX / cellSize, lootItem.size.w);
  const row = clampAnchorIndex(localY / cellSize, lootItem.size.h);
  return { col, row };
}

function buildCrate() {
  const zone = document.getElementById("gameZone");
  if (!zone) return;

  zone.innerHTML = "";

  const crateEl = document.createElement("div");
  crateEl.className = "crate";

  const title = document.createElement("div");
  title.className = "crate-title";
  title.textContent = `${storageCrate.name} · ${crateConfig.columns}×${crateConfig.rows}`;

  crateGridEl = document.createElement("div");
  crateGridEl.className = "crate-grid";
  crateGridEl.dataset.columns = crateConfig.columns;
  crateGridEl.dataset.rows = crateConfig.rows;

  crateGridEl.addEventListener("dragover", handleCrateDragOver);
  crateGridEl.addEventListener("dragleave", handleCrateDragLeave);
  crateGridEl.addEventListener("drop", handleCrateDrop);

  crateEl.append(title, crateGridEl);
  zone.appendChild(crateEl);

  renderCrateItems();
}

function renderCrateItems() {
  if (!crateGridEl) return;
  crateGridEl.innerHTML = "";

  storageCrate.items.forEach((item) => {
    const tile = document.createElement("div");
    tile.className = "loot-tile";
    tile.style.width = `${item.size.w * cellSize}px`;
    tile.style.height = `${item.size.h * cellSize}px`;
    tile.style.left = `${item.position.col * cellSize}px`;
    tile.style.top = `${item.position.row * cellSize}px`;
    tile.draggable = true;
    tile.dataset.lootInstanceId = item.instanceId || item.id;

    tile.addEventListener("dragstart", (event) =>
      handleCrateTileDragStart(event, item),
    );
    tile.addEventListener("dragend", () =>
      tile.classList.remove("is-dragging"),
    );

    const icon = document.createElement("div");
    icon.className = "loot-tile-icon";
    icon.textContent = item.icon;

    const name = document.createElement("div");
    name.className = "loot-card-name";
    name.textContent = item.name;

    const size = document.createElement("div");
    size.className = "loot-card-size";
    size.textContent = `${item.size.w}×${item.size.h}`;

    tile.append(icon, name, size);
    crateGridEl.appendChild(tile);
  });
}

function handleCrateDragOver(event) {
  event.preventDefault();
  if (crateGridEl) {
    crateGridEl.classList.add("crate-grid--active");
    event.dataTransfer.dropEffect = "move";
  }
}

function handleCrateDragLeave() {
  if (crateGridEl) {
    crateGridEl.classList.remove("crate-grid--active");
  }
}

function handleCrateDrop(event) {
  event.preventDefault();
  if (!crateGridEl) return;

  crateGridEl.classList.remove("crate-grid--active");

  const payload = parseDragPayload(event);
  if (!payload || !payload.id) {
    flashInvalidDrop();
    return;
  }

  if (payload.source === "crate") {
    moveItemInsideCrate(payload, event);
  } else if (payload.source === "nearby") {
    moveItemFromNearby(payload, event);
  } else {
    flashInvalidDrop();
  }
}

function moveItemFromNearby(payload, event) {
  const lootIndex = nearbyLoot.findIndex((item) => item.id === payload.id);
  if (lootIndex === -1) {
    flashInvalidDrop();
    return;
  }

  const loot = nearbyLoot[lootIndex];
  const position = resolveDropPosition(event, loot, {
    anchor: payload.anchor,
  });

  if (!position) {
    flashInvalidDrop();
    return;
  }

  storageCrate.items.push(createStoredItem(loot, position));
  nearbyLoot.splice(lootIndex, 1);

  renderNearbyLoot();
  renderCrateItems();
}

function moveItemInsideCrate(payload, event) {
  const itemIndex = storageCrate.items.findIndex(
    (entry) => (entry.instanceId || entry.id) === payload.id,
  );

  if (itemIndex === -1) {
    flashInvalidDrop();
    return;
  }

  const item = storageCrate.items[itemIndex];
  const ignoreId = item.instanceId || item.id;
  const position = resolveDropPosition(event, item, {
    ignoreItemId: ignoreId,
    anchor: payload.anchor,
  });

  if (!position) {
    flashInvalidDrop();
    return;
  }

  storageCrate.items[itemIndex] = {
    ...item,
    position,
  };

  renderCrateItems();
}

function resolveDropPosition(event, loot, options = {}) {
  if (!crateGridEl) return null;
  const { ignoreItemId = null, anchor = { col: 0, row: 0 } } = options;
  const rect = crateGridEl.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  if (offsetX < 0 || offsetY < 0) return null;

  const pointerCol = Math.floor(offsetX / cellSize);
  const pointerRow = Math.floor(offsetY / cellSize);
  const normalizedAnchor = normalizeAnchor(anchor);
  const anchorCol = clampAnchorIndex(normalizedAnchor.col, loot.size.w);
  const anchorRow = clampAnchorIndex(normalizedAnchor.row, loot.size.h);
  const startCol = pointerCol - anchorCol;
  const startRow = pointerRow - anchorRow;

  if (
    startCol < 0 ||
    startRow < 0 ||
    startCol + loot.size.w > crateConfig.columns ||
    startRow + loot.size.h > crateConfig.rows
  ) {
    return null;
  }

  return isAreaFree(startRow, startCol, loot.size.w, loot.size.h, ignoreItemId)
    ? { row: startRow, col: startCol }
    : null;
}

function isAreaFree(row, col, width, height, ignoreItemId = null) {
  return storageCrate.items.every((item) => {
    const itemId = item.instanceId || item.id;
    if (ignoreItemId && itemId === ignoreItemId) {
      return true;
    }
    const otherRow = item.position.row;
    const otherCol = item.position.col;
    const otherWidth = item.size.w;
    const otherHeight = item.size.h;

    const noOverlap =
      col + width <= otherCol ||
      otherCol + otherWidth <= col ||
      row + height <= otherRow ||
      otherRow + otherHeight <= row;

    return noOverlap;
  });
}

function flashInvalidDrop() {
  if (!crateGridEl) return;
  crateGridEl.classList.add("crate-grid--invalid");
  setTimeout(() => crateGridEl.classList.remove("crate-grid--invalid"), 220);
}

function clampAnchorIndex(value, maxSize) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const floor = Math.floor(value);
  const upperBound = Math.max(0, maxSize - 1);
  return Math.min(Math.max(0, floor), upperBound);
}

initLootInterface();
