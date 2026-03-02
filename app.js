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
let dragSizeIndicatorEl = null;
let activeDragPayload = null;
let isDraggingNow = false;
let dragPointerId = null;
let dragSourceElement = null;
let lastDragOverPointer = null;

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
  window.addEventListener("keydown", handleDragKeydown);
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
    card.dataset.lootId = loot.id;

    card.addEventListener("pointerdown", (event) =>
      handleNearbyPointerDown(event, loot),
    );

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

function handleNearbyPointerDown(event, loot) {
  if (!isPrimaryPointer(event)) return;
  event.preventDefault();
  const payload = {
    source: "nearby",
    id: loot.id,
    anchor: { col: 0, row: 0 },
    size: { ...loot.size },
  };
  beginManualDrag(event, payload, event.currentTarget);
}

function handleCrateTilePointerDown(event, lootItem) {
  if (!isPrimaryPointer(event)) return;
  event.preventDefault();
  const anchor = getTileAnchor(event, lootItem);
  const payload = {
    source: "crate",
    id: lootItem.instanceId || lootItem.id,
    anchor,
    size: { ...lootItem.size },
  };
  beginManualDrag(event, payload, event.currentTarget);
}

function getTileAnchor(event, lootItem) {
  if (!lootItem || !event.currentTarget) {
    return { col: 0, row: 0 };
  }

  const rect = event.currentTarget.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
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
    tile.dataset.lootInstanceId = item.instanceId || item.id;

    tile.addEventListener("pointerdown", (event) =>
      handleCrateTilePointerDown(event, item),
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

  ensureDragSizeIndicator();
}

function beginManualDrag(event, payload, sourceElement) {
  if (!payload) return;
  if (isDraggingNow) {
    clearActiveDragState();
  }

  activeDragPayload = payload;
  isDraggingNow = true;
  dragPointerId =
    typeof event.pointerId === "number" && Number.isFinite(event.pointerId)
      ? event.pointerId
      : null;
  dragSourceElement = sourceElement || null;
  if (dragSourceElement) {
    dragSourceElement.classList.add("is-dragging");
  }
  lastDragOverPointer = null;

  window.addEventListener("pointermove", handleGlobalPointerMove);
  window.addEventListener("pointerup", handleGlobalPointerUp);
  window.addEventListener("pointercancel", handleGlobalPointerCancel);

  updateCrateHoverState(event);
}

function updateCrateHoverState(event) {
  if (!crateGridEl || !activeDragPayload) return;
  const inside = isPointerInsideCrate(event);
  if (inside) {
    crateGridEl.classList.add("crate-grid--active");
    lastDragOverPointer = { clientX: event.clientX, clientY: event.clientY };
    showDragSizeIndicator(event, activeDragPayload);
  } else {
    crateGridEl.classList.remove("crate-grid--active");
    hideDragSizeIndicator();
    lastDragOverPointer = null;
  }
}

function handleGlobalPointerMove(event) {
  if (!isDraggingNow) {
    return;
  }
  if (dragPointerId !== null && event.pointerId !== dragPointerId) {
    return;
  }
  updateCrateHoverState(event);
}

function handleGlobalPointerUp(event) {
  if (!isDraggingNow) {
    return;
  }
  if (dragPointerId !== null && event.pointerId !== dragPointerId) {
    return;
  }
  const inside = isPointerInsideCrate(event);
  if (inside) {
    attemptCrateDrop(event);
  } else {
    crateGridEl?.classList.remove("crate-grid--active");
    hideDragSizeIndicator();
  }
  clearActiveDragState();
}

function handleGlobalPointerCancel(event) {
  if (dragPointerId !== null && event.pointerId !== dragPointerId) {
    return;
  }
  clearActiveDragState();
}

function isPointerInsideCrate(event) {
  if (!crateGridEl) return false;
  const rect = crateGridEl.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function attemptCrateDrop(event) {
  if (!crateGridEl) return;

  const payload = activeDragPayload;
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

function isPrimaryPointer(event) {
  if (typeof event.button === "number" && event.button !== 0) {
    return false;
  }
  if (typeof event.buttons === "number" && event.buttons !== 0 && (event.buttons & 1) === 0) {
    return false;
  }
  return true;
}

function moveItemFromNearby(payload, event) {
  const lootIndex = nearbyLoot.findIndex((item) => item.id === payload.id);
  if (lootIndex === -1) {
    flashInvalidDrop();
    return;
  }

  const loot = nearbyLoot[lootIndex];
  const placementCandidate = payload.size
    ? { ...loot, size: { ...payload.size } }
    : loot;
  const position = resolveDropPosition(event, placementCandidate, {
    anchor: payload.anchor,
  });

  if (!position) {
    flashInvalidDrop();
    return;
  }

  storageCrate.items.push(createStoredItem(placementCandidate, position));
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
  const placementCandidate = payload.size
    ? { ...item, size: { ...payload.size } }
    : item;
  const position = resolveDropPosition(event, placementCandidate, {
    ignoreItemId: ignoreId,
    anchor: payload.anchor,
  });

  if (!position) {
    flashInvalidDrop();
    return;
  }

  storageCrate.items[itemIndex] = {
    ...item,
    size: { ...placementCandidate.size },
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

function ensureDragSizeIndicator() {
  if (!crateGridEl) return null;

  if (!dragSizeIndicatorEl) {
    dragSizeIndicatorEl = document.createElement("div");
    dragSizeIndicatorEl.className = "drag-size-indicator";
  }

  if (!crateGridEl.contains(dragSizeIndicatorEl)) {
    crateGridEl.appendChild(dragSizeIndicatorEl);
  }

  return dragSizeIndicatorEl;
}

function showDragSizeIndicator(event, payload) {
  if (!crateGridEl || !payload || !payload.size) return;
  const indicator = ensureDragSizeIndicator();
  if (!indicator) return;

  const rect = crateGridEl.getBoundingClientRect();
  const offsetX = clamp(event.clientX - rect.left, 0, rect.width);
  const offsetY = clamp(event.clientY - rect.top, 0, rect.height);
  const pointerCol = clamp(
    Math.floor(offsetX / cellSize),
    0,
    Math.max(0, crateConfig.columns - 1),
  );
  const pointerRow = clamp(
    Math.floor(offsetY / cellSize),
    0,
    Math.max(0, crateConfig.rows - 1),
  );
  const normalizedAnchor = normalizeAnchor(payload.anchor || { col: 0, row: 0 });
  const anchorCol = clampAnchorIndex(normalizedAnchor.col, payload.size.w);
  const anchorRow = clampAnchorIndex(normalizedAnchor.row, payload.size.h);

  let startCol = pointerCol - anchorCol;
  let startRow = pointerRow - anchorRow;
  const maxCol = Math.max(0, crateConfig.columns - payload.size.w);
  const maxRow = Math.max(0, crateConfig.rows - payload.size.h);
  startCol = clamp(startCol, 0, maxCol);
  startRow = clamp(startRow, 0, maxRow);

  indicator.style.width = `${payload.size.w * cellSize}px`;
  indicator.style.height = `${payload.size.h * cellSize}px`;
  indicator.style.left = `${startCol * cellSize}px`;
  indicator.style.top = `${startRow * cellSize}px`;
  indicator.classList.add("is-visible");
}

function hideDragSizeIndicator() {
  if (dragSizeIndicatorEl) {
    dragSizeIndicatorEl.classList.remove("is-visible");
  }
}

function clearActiveDragState() {
  activeDragPayload = null;
  hideDragSizeIndicator();
  isDraggingNow = false;
  lastDragOverPointer = null;
  if (crateGridEl) {
    crateGridEl.classList.remove("crate-grid--active");
  }
  if (dragSourceElement) {
    dragSourceElement.classList.remove("is-dragging");
    dragSourceElement = null;
  }
  window.removeEventListener("pointermove", handleGlobalPointerMove);
  window.removeEventListener("pointerup", handleGlobalPointerUp);
  window.removeEventListener("pointercancel", handleGlobalPointerCancel);
  dragPointerId = null;
}

function clampAnchorIndex(value, maxSize) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const floor = Math.floor(value);
  const upperBound = Math.max(0, maxSize - 1);
  return Math.min(Math.max(0, floor), upperBound);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (min > max) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function handleDragKeydown(event) {
  if (!isDraggingNow || event.defaultPrevented) {
    return;
  }
  if (event.code !== "Space" && event.key !== " ") {
    return;
  }
  if (event.repeat) {
    return;
  }
  console.log("Пробел нажат");
  event.preventDefault();
  rotateActiveDragPayload();
}

function rotateActiveDragPayload() {
  if (!activeDragPayload || !activeDragPayload.size) {
    return;
  }
  const { w, h } = activeDragPayload.size;
  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    return;
  }
  const anchor = normalizeAnchor(activeDragPayload.anchor || { col: 0, row: 0 });
  activeDragPayload = {
    ...activeDragPayload,
    anchor: {
      col: clampAnchorIndex(anchor.row, h),
      row: clampAnchorIndex(anchor.col, w),
    },
    size: { w: h, h: w },
  };
  refreshDragSizeIndicator();
}

function refreshDragSizeIndicator() {
  if (!crateGridEl || !activeDragPayload || !lastDragOverPointer) {
    return;
  }
  showDragSizeIndicator(
    {
      clientX: lastDragOverPointer.clientX,
      clientY: lastDragOverPointer.clientY,
    },
    activeDragPayload,
  );
}

initLootInterface();
