import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  FormControl,
  FormLabel,
  Stack,
  AspectRatio,
  Switch,
  Chip,
  ChipDelete,
  Input,
  Alert,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  IconButton,
  Tooltip,
} from "@mui/joy";
import UploadIcon from "@mui/icons-material/Upload";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import ImageIcon from "@mui/icons-material/Image";
import EmojiEmotionsIcon from "@mui/icons-material/EmojiEmotions";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import * as MuiIcons from "@mui/icons-material";

import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";

// Curated set of commonly useful icons for app branding
const ICON_CATALOG = [
  "Chat", "Forum", "Message", "Email", "Inbox",
  "Hub", "Lan", "Cloud", "CloudQueue", "Storage",
  "Code", "Terminal", "DeveloperMode", "Api", "Extension",
  "Rocket", "RocketLaunch", "Star", "AutoAwesome", "Bolt",
  "Psychology", "SmartToy", "Android", "Adb",
  "Business", "Work", "CorporateFare", "Apartment", "AccountBalance",
  "School", "LocalLibrary", "MenuBook", "AutoStories",
  "Analytics", "BarChart", "PieChart", "TrendingUp", "Insights",
  "Security", "Lock", "Shield", "VerifiedUser", "AdminPanelSettings",
  "Settings", "Build", "Tune", "Handyman",
  "Favorite", "Pets", "EmojiNature", "EnergySavingsLeaf", "LocalFlorist",
  "Sports", "SportsEsports", "VideogameAsset", "Casino",
  "MusicNote", "Headphones", "Radio", "Mic",
  "Movie", "Theaters", "LiveTv", "PlayCircle",
  "Photo", "CameraAlt", "Collections", "Palette",
  "Map", "Explore", "Public", "Language", "Translate",
  "Person", "Group", "Groups", "People",
  "Home", "House", "Cottage", "Villa",
  "Flight", "Train", "DirectionsCar", "Sailing",
  "Restaurant", "LocalCafe", "Fastfood", "BakeryDining",
  "ShoppingCart", "Store", "LocalMall",
  "HealthAndSafety", "LocalHospital", "Healing",
  "Nature", "Park", "ForestOutlined", "Grass",
  "Diamond", "MilitaryTech", "EmojiEvents", "WorkspacePremium",
  "Diversity1", "Handshake", "ConnectWithoutContact",
  "Search", "FindInPage", "ManageSearch",
  "Notifications", "NotificationsActive",
  "Palette", "Brush", "ColorLens", "Draw",
  "Memory", "Computer", "Laptop", "PhoneAndroid",
  "DataObject", "Schema", "Dataset",
  "AccountTree", "DeviceHub",
];

export default function GeneralSettings() {
  const toast = useToast();
  const { authMode } = useAuth();
  const [logo, setLogo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingIcon, setSavingIcon] = useState(false);
  const [logoTab, setLogoTab] = useState(0); // 0 = Upload, 1 = Icon library
  const [iconSearch, setIconSearch] = useState("");
  const fileInputRef = useRef(null);

  // Signup restriction state
  const [restrictSignups, setRestrictSignups] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState([]);
  const [newDomain, setNewDomain] = useState("");
  const [savingSignup, setSavingSignup] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const settings = await api.getSettings();
      const logoSetting = settings.find((s) => s.key === "logo");
      setLogo(logoSetting?.value || null);

      const signupSetting = settings.find((s) => s.key === "signup");
      if (signupSetting?.value) {
        setRestrictSignups(signupSetting.value.restrictSignups || false);
        setAllowedDomains(signupSetting.value.allowedDomains || []);
      }
    } catch (err) {
      toast.error("Failed to load settings: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSignupSettings = async (overrides = {}) => {
    try {
      setSavingSignup(true);
      const data = {
        restrictSignups: overrides.restrictSignups !== undefined ? overrides.restrictSignups : restrictSignups,
        allowedDomains: overrides.allowedDomains !== undefined ? overrides.allowedDomains : allowedDomains,
      };
      await api.updateSignupSettings(data);
      toast.success("Signup settings saved.");
    } catch (err) {
      toast.error("Failed to save signup settings: " + err.message);
    } finally {
      setSavingSignup(false);
    }
  };

  const handleToggleRestrictSignups = async (e) => {
    const val = e.target.checked;
    setRestrictSignups(val);
    await handleSaveSignupSettings({ restrictSignups: val });
  };

  const handleAddDomain = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(domain)) {
      toast.error("Invalid domain format.");
      return;
    }
    if (allowedDomains.includes(domain)) {
      toast.error("Domain already in the list.");
      return;
    }
    const updated = [...allowedDomains, domain];
    setAllowedDomains(updated);
    setNewDomain("");
    await handleSaveSignupSettings({ allowedDomains: updated });
  };

  const handleRemoveDomain = async (domain) => {
    const updated = allowedDomains.filter((d) => d !== domain);
    setAllowedDomains(updated);
    await handleSaveSignupSettings({ allowedDomains: updated });
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File size must be under 2MB.");
      return;
    }
    try {
      setUploading(true);
      const setting = await api.uploadLogo(file);
      setLogo(setting.value || null);
      toast.success("Logo uploaded successfully.");
    } catch (err) {
      toast.error("Failed to upload logo: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to remove the logo?")) return;
    try {
      await api.deleteLogo();
      setLogo(null);
      toast.success("Logo removed successfully.");
    } catch (err) {
      toast.error("Failed to remove logo: " + err.message);
    }
  };

  const handleSelectIcon = async (iconName) => {
    try {
      setSavingIcon(true);
      const setting = await api.setLogoIcon(iconName);
      setLogo(setting.value || null);
      toast.success("Icon set successfully.");
    } catch (err) {
      toast.error("Failed to set icon: " + err.message);
    } finally {
      setSavingIcon(false);
    }
  };

  // Filter icon catalog by search query
  const filteredIcons = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    if (!q) return ICON_CATALOG;
    return ICON_CATALOG.filter((name) => name.toLowerCase().includes(q));
  }, [iconSearch]);

  if (loading) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "var(--bg-primary)",
        }}
      >
        <Typography level="body-lg" sx={{ color: "var(--text-secondary)" }}>
          Loading...
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        p: { xs: 2, sm: 3, md: 4 },
        bgcolor: "var(--bg-primary)",
        color: "var(--text-primary)",
        overflow: "auto",
      }}
    >
      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography
            level="h2"
            sx={{
              mb: 1,
              color: "var(--text-primary)",
              fontWeight: 700,
              fontSize: { xs: "1.5rem", md: "1.75rem" },
            }}
          >
            General
          </Typography>
          <Typography
            level="body-lg"
            sx={{ color: "var(--text-secondary)", fontSize: "1rem" }}
          >
            Application-wide settings and branding.
          </Typography>
        </Box>

        {/* Logo card */}
        <Card
          variant="outlined"
          sx={{
            borderColor: "var(--border-color)",
            bgcolor: "var(--bg-primary)",
          }}
        >
          <CardContent>
            <Typography
              level="title-md"
              sx={{ mb: 0.5, fontWeight: 700, color: "var(--text-primary)" }}
            >
              Application Logo
            </Typography>
            <Typography
              level="body-sm"
              sx={{ mb: 3, color: "var(--text-secondary)" }}
            >
              Choose a logo to display in the sidebar — either upload your own
              image or pick an icon from the library.
            </Typography>

            <Stack spacing={3}>
              {/* Current logo preview */}
              {logo && (logo.fileId || logo.iconName) && (
                <Box>
                  <FormLabel
                    sx={{
                      mb: 1,
                      color: "var(--text-secondary)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    Current Logo
                  </FormLabel>
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 2,
                      p: 2,
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      bgcolor: "var(--bg-secondary)",
                    }}
                  >
                    {logo.fileId ? (
                      <>
                        <AspectRatio
                          ratio="1"
                          sx={{ width: 64, borderRadius: "8px", overflow: "hidden" }}
                        >
                          <img
                            src={api.getPublicFileUrl(logo.fileId)}
                            alt="Current logo"
                            style={{ objectFit: "contain" }}
                          />
                        </AspectRatio>
                        <Box>
                          <Typography
                            level="body-sm"
                            sx={{ fontWeight: 600, color: "var(--text-primary)" }}
                          >
                            {logo.filename}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: "var(--text-tertiary)" }}
                          >
                            {logo.contentType} · {Math.round(logo.size / 1024)} KB
                          </Typography>
                        </Box>
                      </>
                    ) : (
                      <>
                        <Box
                          sx={{
                            width: 64,
                            height: 64,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "8px",
                            bgcolor: "var(--bg-primary)",
                            border: "1px solid var(--border-color)",
                          }}
                        >
                          {(() => {
                            const IconComp = MuiIcons[logo.iconName];
                            return IconComp ? (
                              <IconComp sx={{ fontSize: 36, color: "var(--text-primary)" }} />
                            ) : null;
                          })()}
                        </Box>
                        <Typography
                          level="body-sm"
                          sx={{ fontWeight: 600, color: "var(--text-primary)" }}
                        >
                          {logo.iconName}
                        </Typography>
                      </>
                    )}
                  </Box>
                </Box>
              )}

              {/* Tabs: Upload image / Choose icon */}
              <Tabs
                value={logoTab}
                onChange={(_, v) => setLogoTab(v)}
                sx={{ bgcolor: "transparent" }}
              >
                <TabList
                  sx={{
                    mb: 2,
                    bgcolor: "var(--bg-secondary)",
                    borderRadius: "8px",
                    p: 0.5,
                    border: "1px solid var(--border-color)",
                    gap: 0.5,
                  }}
                >
                  <Tab
                    value={0}
                    sx={{
                      borderRadius: "6px",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      flex: 1,
                    }}
                  >
                    <ImageIcon sx={{ fontSize: 16, mr: 0.75 }} />
                    Upload Image
                  </Tab>
                  <Tab
                    value={1}
                    sx={{
                      borderRadius: "6px",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      flex: 1,
                    }}
                  >
                    <EmojiEmotionsIcon sx={{ fontSize: 16, mr: 0.75 }} />
                    Icon Library
                  </Tab>
                </TabList>

                {/* Upload Image panel */}
                <TabPanel value={0} sx={{ p: 0 }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleUpload}
                      style={{ display: "none" }}
                      id="logo-upload-input"
                    />
                    <Button
                      component="label"
                      htmlFor="logo-upload-input"
                      startDecorator={<UploadIcon />}
                      loading={uploading}
                      variant="solid"
                      color="primary"
                    >
                      {logo ? "Replace" : "Upload"}
                    </Button>
                    {logo && (
                      <Button
                        variant="outlined"
                        color="danger"
                        startDecorator={<DeleteIcon />}
                        onClick={handleDelete}
                      >
                        Remove
                      </Button>
                    )}
                  </Box>
                  <Typography level="body-xs" sx={{ mt: 1, color: "var(--text-tertiary)" }}>
                    Recommended: square PNG or SVG, under 2 MB.
                  </Typography>
                </TabPanel>

                {/* Icon Library panel */}
                <TabPanel value={1} sx={{ p: 0 }}>
                  <Input
                    size="sm"
                    placeholder="Search icons…"
                    value={iconSearch}
                    onChange={(e) => setIconSearch(e.target.value)}
                    sx={{ mb: 2, maxWidth: 280 }}
                  />
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 1,
                      maxHeight: 320,
                      overflowY: "auto",
                      p: 1,
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      bgcolor: "var(--bg-secondary)",
                    }}
                  >
                    {filteredIcons.length === 0 && (
                      <Typography level="body-sm" sx={{ color: "var(--text-tertiary)", p: 1 }}>
                        No icons match your search.
                      </Typography>
                    )}
                    {filteredIcons.map((iconName) => {
                      const IconComp = MuiIcons[iconName];
                      if (!IconComp) return null;
                      const isSelected = logo?.iconName === iconName;
                      return (
                        <Tooltip key={iconName} title={iconName} size="sm" placement="top">
                          <IconButton
                            variant={isSelected ? "solid" : "plain"}
                            color={isSelected ? "primary" : "neutral"}
                            size="sm"
                            disabled={savingIcon}
                            onClick={() => handleSelectIcon(iconName)}
                            sx={{
                              width: 40,
                              height: 40,
                              borderRadius: "8px",
                              position: "relative",
                              border: isSelected
                                ? "2px solid var(--joy-palette-primary-500)"
                                : "1px solid transparent",
                              "&:hover": {
                                border: "1px solid var(--border-color)",
                              },
                            }}
                          >
                            <IconComp sx={{ fontSize: 22 }} />
                            {isSelected && (
                              <CheckCircleIcon
                                sx={{
                                  position: "absolute",
                                  top: -6,
                                  right: -6,
                                  fontSize: 14,
                                  color: "var(--joy-palette-primary-500)",
                                  bgcolor: "var(--bg-primary)",
                                  borderRadius: "50%",
                                }}
                              />
                            )}
                          </IconButton>
                        </Tooltip>
                      );
                    })}
                  </Box>
                  {logo && (
                    <Button
                      size="sm"
                      variant="outlined"
                      color="danger"
                      startDecorator={<DeleteIcon />}
                      onClick={handleDelete}
                      sx={{ mt: 1.5 }}
                    >
                      Remove logo
                    </Button>
                  )}
                </TabPanel>
              </Tabs>
            </Stack>
          </CardContent>
        </Card>

        {/* Signup Restrictions card — only shown in LOCAL auth mode */}
        {authMode === "LOCAL" && (
          <Card
            variant="outlined"
            sx={{
              mt: 3,
              borderColor: "var(--border-color)",
              bgcolor: "var(--bg-primary)",
            }}
          >
            <CardContent>
              <Typography
                level="title-md"
                sx={{ mb: 0.5, fontWeight: 700, color: "var(--text-primary)" }}
              >
                Signup Restrictions
              </Typography>
              <Typography
                level="body-sm"
                sx={{ mb: 3, color: "var(--text-secondary)" }}
              >
                Control who can create new accounts when using local
                authentication.
              </Typography>

              <Stack spacing={3}>
                {/* Toggle: Restrict new signups */}
                <FormControl
                  orientation="horizontal"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    p: 2,
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    bgcolor: "var(--bg-secondary)",
                  }}
                >
                  <Box>
                    <FormLabel
                      sx={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        mb: 0.25,
                      }}
                    >
                      Restrict new signups
                    </FormLabel>
                    <Typography
                      level="body-xs"
                      sx={{ color: "var(--text-tertiary)" }}
                    >
                      When enabled, no new users can register.
                    </Typography>
                  </Box>
                  <Switch
                    checked={restrictSignups}
                    onChange={handleToggleRestrictSignups}
                    disabled={savingSignup}
                  />
                </FormControl>

                {/* Allowed Domains */}
                {!restrictSignups && (
                  <Box>
                    <FormLabel
                      sx={{
                        color: "var(--text-secondary)",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        mb: 1,
                      }}
                    >
                      Accept only specific email domains
                    </FormLabel>
                    <Typography
                      level="body-xs"
                      sx={{ color: "var(--text-tertiary)", mb: 1.5 }}
                    >
                      When domains are listed, only users with matching email
                      addresses can register. Leave empty to allow all domains.
                    </Typography>

                    {/* Domain chips */}
                    {allowedDomains.length > 0 && (
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 1,
                          mb: 1.5,
                        }}
                      >
                        {allowedDomains.map((domain) => (
                          <Chip
                            key={domain}
                            variant="soft"
                            color="primary"
                            endDecorator={
                              <ChipDelete
                                onDelete={() => handleRemoveDomain(domain)}
                              />
                            }
                          >
                            {domain}
                          </Chip>
                        ))}
                      </Box>
                    )}

                    {/* Add domain input */}
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <Input
                        size="sm"
                        placeholder="e.g. example.com"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddDomain();
                          }
                        }}
                        disabled={savingSignup}
                        sx={{ flex: 1 }}
                      />
                      <Button
                        size="sm"
                        variant="outlined"
                        color="neutral"
                        startDecorator={<AddIcon />}
                        onClick={handleAddDomain}
                        disabled={savingSignup || !newDomain.trim()}
                      >
                        Add
                      </Button>
                    </Box>

                    {allowedDomains.length === 0 && (
                      <Alert
                        variant="soft"
                        color="neutral"
                        size="sm"
                        sx={{ mt: 1.5 }}
                      >
                        No domain restrictions — all email addresses are accepted.
                      </Alert>
                    )}
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
}
