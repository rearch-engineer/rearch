import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { getLeaves } from "react-mosaic-component";

/**
 * Panel IDs:
 *   "conversation"      – ChatInterface
 *   "service:<index>"   – embedded service iframe
 */

const STORAGE_PREFIX = "panel-layout:";
const DEBOUNCE_MS = 400;

function storageKey(id) {
  return `${STORAGE_PREFIX}${id}`;
}

function saveLayout(id, state) {
  if (!id || id === "new") return;
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(state));
  } catch { /* quota */ }
}

function loadLayout(id) {
  if (!id || id === "new") return null;
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function defaultLayout() {
  return {
    mosaicTree: "tile-1",
    tiles: { "tile-1": { tabs: ["conversation"], activeTab: "conversation" } },
    nextTileId: 2,
  };
}

const PanelContext = createContext(null);

export function PanelProvider({ conversationId, services, children }) {
  const [layout, setLayout] = useState(() => loadLayout(conversationId) || defaultLayout());
  const debounceRef = useRef(null);
  const convIdRef = useRef(conversationId);

  // Reload layout on conversation change
  useEffect(() => {
    convIdRef.current = conversationId;
    setLayout(loadLayout(conversationId) || defaultLayout());
  }, [conversationId]);

  // Debounced persist
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveLayout(convIdRef.current, layout), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [layout]);

  // Auto-open service tabs
  const autoOpenedRef = useRef(new Set());

  useEffect(() => {
    if (!services || services.length === 0) return;
    setLayout((prev) => {
      const openPanels = new Set();
      for (const tile of Object.values(prev.tiles)) {
        for (const tab of tile.tabs) openPanels.add(tab);
      }
      const targetTileId = Object.keys(prev.tiles)[0];
      if (!targetTileId) return prev;

      let updated = false;
      const targetTile = { ...prev.tiles[targetTileId] };
      const newTabs = [...targetTile.tabs];

      for (let i = 0; i < services.length; i++) {
        const panelId = `service:${i}`;
        if (!openPanels.has(panelId) && !autoOpenedRef.current.has(panelId)) {
          newTabs.push(panelId);
          autoOpenedRef.current.add(panelId);
          updated = true;
        }
      }
      if (!updated) return prev;
      targetTile.tabs = newTabs;
      return { ...prev, tiles: { ...prev.tiles, [targetTileId]: targetTile } };
    });
  }, [services]);

  useEffect(() => { autoOpenedRef.current = new Set(); }, [conversationId]);

  /* ── Mosaic tree ── */
  const updateMosaicTree = useCallback((newTree) => {
    setLayout((prev) => {
      if (newTree === null) return defaultLayout();
      const activeLeaves = new Set(getLeaves(newTree));
      const tiles = {};
      for (const [id, data] of Object.entries(prev.tiles)) {
        if (activeLeaves.has(id)) tiles[id] = data;
      }
      return { ...prev, mosaicTree: newTree, tiles };
    });
  }, []);

  /* ── Tab operations ── */
  const setActiveTab = useCallback((tileId, panelId) => {
    setLayout((prev) => ({
      ...prev,
      tiles: { ...prev.tiles, [tileId]: { ...prev.tiles[tileId], activeTab: panelId } },
    }));
  }, []);

  const addTab = useCallback((panelId, targetTileId) => {
    setLayout((prev) => {
      for (const tile of Object.values(prev.tiles)) {
        if (tile.tabs.includes(panelId)) return prev;
      }
      const tileId = targetTileId || Object.keys(prev.tiles)[0];
      if (!tileId || !prev.tiles[tileId]) return prev;
      return {
        ...prev,
        tiles: {
          ...prev.tiles,
          [tileId]: { tabs: [...prev.tiles[tileId].tabs, panelId], activeTab: panelId },
        },
      };
    });
  }, []);

  const removeTab = useCallback((panelId) => {
    setLayout((prev) => {
      let tileToRemove = null;
      const newTiles = {};
      for (const [tileId, tileData] of Object.entries(prev.tiles)) {
        const idx = tileData.tabs.indexOf(panelId);
        if (idx === -1) { newTiles[tileId] = tileData; continue; }
        const newTabs = tileData.tabs.filter((t) => t !== panelId);
        if (newTabs.length === 0) { tileToRemove = tileId; }
        else {
          const newActive = tileData.activeTab === panelId
            ? newTabs[Math.min(idx, newTabs.length - 1)] : tileData.activeTab;
          newTiles[tileId] = { tabs: newTabs, activeTab: newActive };
        }
      }
      let newTree = prev.mosaicTree;
      if (tileToRemove) {
        newTree = removeTileFromTree(prev.mosaicTree, tileToRemove);
        if (newTree === null) return defaultLayout();
      }
      return { ...prev, mosaicTree: newTree, tiles: newTiles };
    });
  }, []);

  const splitWithPanel = useCallback((panelId, sourceTileId, direction = "row") => {
    setLayout((prev) => {
      for (const tile of Object.values(prev.tiles)) {
        if (tile.tabs.includes(panelId)) return prev;
      }
      const newTileId = `tile-${prev.nextTileId}`;
      const newTiles = { ...prev.tiles, [newTileId]: { tabs: [panelId], activeTab: panelId } };
      const newTree = replaceTileInTree(prev.mosaicTree, sourceTileId, {
        type: "split", direction, children: [sourceTileId, newTileId], splitPercentages: [50, 50],
      });
      return { mosaicTree: newTree, tiles: newTiles, nextTileId: prev.nextTileId + 1 };
    });
  }, []);

  const moveTab = useCallback((panelId, fromTileId, toTileId) => {
    setLayout((prev) => {
      const fromTile = prev.tiles[fromTileId];
      const toTile = prev.tiles[toTileId];
      if (!fromTile || !toTile || !fromTile.tabs.includes(panelId) || toTile.tabs.includes(panelId)) return prev;
      const newFromTabs = fromTile.tabs.filter((t) => t !== panelId);
      const newTiles = { ...prev.tiles };
      let newTree = prev.mosaicTree;
      if (newFromTabs.length === 0) {
        delete newTiles[fromTileId];
        newTree = removeTileFromTree(prev.mosaicTree, fromTileId);
        if (newTree === null) return defaultLayout();
      } else {
        const newActive = fromTile.activeTab === panelId ? newFromTabs[0] : fromTile.activeTab;
        newTiles[fromTileId] = { tabs: newFromTabs, activeTab: newActive };
      }
      newTiles[toTileId] = { tabs: [...toTile.tabs, panelId], activeTab: panelId };
      return { ...prev, mosaicTree: newTree, tiles: newTiles };
    });
  }, []);

  const resetLayout = useCallback(() => setLayout(defaultLayout()), []);

  const getOpenPanels = useCallback(() => {
    const panels = new Set();
    for (const tile of Object.values(layout.tiles)) {
      for (const tab of tile.tabs) panels.add(tab);
    }
    return panels;
  }, [layout.tiles]);

  /* ── Panel action registry (for context menu) ── */
  const panelActionsRef = useRef({});
  const registerPanelActions = useCallback((panelId, actions) => { panelActionsRef.current[panelId] = actions; }, []);
  const unregisterPanelActions = useCallback((panelId) => { delete panelActionsRef.current[panelId]; }, []);
  const getPanelActions = useCallback((panelId) => panelActionsRef.current[panelId] || null, []);

  /* ── Sidebar collapsed state ── */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarCollapsed((p) => !p), []);

  const value = {
    layout, services: services || [],
    updateMosaicTree, setActiveTab, addTab, removeTab, splitWithPanel, moveTab, resetLayout, getOpenPanels,
    registerPanelActions, unregisterPanelActions, getPanelActions,
    sidebarCollapsed, setSidebarCollapsed, toggleSidebar,
  };

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanels() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanels must be used within PanelProvider");
  return ctx;
}

/* ── Tree helpers (supports both legacy binary and n-ary v7 format) ── */

function removeTileFromTree(tree, tileId) {
  if (tree === tileId) return null;
  if (typeof tree === "string" || typeof tree === "number") return tree;
  if (!tree) return null;
  if (tree.type === "split" && Array.isArray(tree.children)) {
    const c = tree.children.map((ch) => removeTileFromTree(ch, tileId)).filter((ch) => ch !== null);
    if (c.length === 0) return null;
    if (c.length === 1) return c[0];
    return { ...tree, children: c };
  }
  if ("first" in tree && "second" in tree) {
    if (tree.first === tileId) return tree.second;
    if (tree.second === tileId) return tree.first;
    const f = removeTileFromTree(tree.first, tileId);
    const s = removeTileFromTree(tree.second, tileId);
    if (f === null) return s;
    if (s === null) return f;
    return { ...tree, first: f, second: s };
  }
  return tree;
}

function replaceTileInTree(tree, tileId, replacement) {
  if (tree === tileId) return replacement;
  if (typeof tree === "string" || typeof tree === "number") return tree;
  if (!tree) return tree;
  if (tree.type === "split" && Array.isArray(tree.children)) {
    return { ...tree, children: tree.children.map((ch) => replaceTileInTree(ch, tileId, replacement)) };
  }
  if ("first" in tree && "second" in tree) {
    return { ...tree, first: replaceTileInTree(tree.first, tileId, replacement), second: replaceTileInTree(tree.second, tileId, replacement) };
  }
  return tree;
}
