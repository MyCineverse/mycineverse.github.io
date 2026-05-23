const TMDB_API_KEY = window.TMDB_CONFIG?.apiKey || "PASTE_YOUR_TMDB_API_KEY_HERE";
const TMDB_BASE = "https://api.themoviedb.org/3";
const JIKAN_BASE = "https://api.jikan.moe/v4";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w780";
const MONETAG_SMARTLINK = "https://omg10.com/4/11016678";
const POSTER_PLACEHOLDER =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#121a30" offset="0"/>
          <stop stop-color="#050816" offset="1"/>
        </linearGradient>
      </defs>
      <rect width="600" height="900" fill="url(#g)"/>
      <text x="50%" y="48%" text-anchor="middle" fill="#9ca8be" font-family="Arial, sans-serif" font-size="28">No poster</text>
      <text x="50%" y="54%" text-anchor="middle" fill="#6dd6ff" font-family="Arial, sans-serif" font-size="18">Available on TMDB</text>
    </svg>
  `);

const sections = {
  movie: {
    new_releases: { label: "Trending now", endpoint: "/discover/movie?sort_by=primary_release_date.desc" },
    popular: { label: "Popular titles", endpoint: "/movie/popular" },
    top_rated: { label: "Top rated titles", endpoint: "/movie/top_rated" },
    now_playing: { label: "Now playing titles", endpoint: "/movie/now_playing" },
    upcoming: { label: "Upcoming titles", endpoint: "/movie/upcoming" },
  },
  tv: {
    new_releases: { label: "Trending now", endpoint: "/discover/tv?sort_by=first_air_date.desc" },
    popular: { label: "Popular shows", endpoint: "/tv/popular" },
    top_rated: { label: "Top rated shows", endpoint: "/tv/top_rated" },
    now_playing: { label: "Airing today", endpoint: "/tv/airing_today" },
    upcoming: { label: "On the air", endpoint: "/tv/on_the_air" },
  },
  anime: {
    new_releases: { label: "Trending now", endpoint: "/discover/tv?sort_by=first_air_date.desc" },
    popular: { label: "Popular anime", endpoint: "/discover/tv?sort_by=popularity.desc" },
    top_rated: { label: "Top rated anime", endpoint: "/discover/tv?sort_by=vote_average.desc" },
    now_playing: { label: "Recent anime", endpoint: "/discover/tv?sort_by=first_air_date.desc" },
    upcoming: { label: "More anime", endpoint: "/discover/tv?sort_by=popularity.desc" },
  },
};

const state = {
  media: "movie",
  section: "new_releases",
  genre: "all",
  searchTerm: "",
  genres: [],
  featured: null,
  featuredQueue: [],
  featuredTimer: null,
  featuredRefreshTimer: null,
  featuredIndex: 0,
  searchSuggestTimer: null,
  searchSuggestToken: 0,
  searchSuggestions: [],
  currentMovies: [],
  currentPage: 1,
  totalPages: 1,
};

const providerHomepages = {
  Netflix: "https://www.netflix.com",
  "Prime Video": "https://www.primevideo.com",
  Hulu: "https://www.hulu.com",
  "Disney Plus": "https://www.disneyplus.com",
  "Disney+": "https://www.disneyplus.com",
  "Apple TV+": "https://tv.apple.com",
  Max: "https://www.max.com",
  "HBO Max": "https://www.max.com",
  Crunchyroll: "https://www.crunchyroll.com",
  HIDIVE: "https://www.hidive.com",
  Peacock: "https://www.peacocktv.com",
  "Paramount Plus": "https://www.paramountplus.com",
};

// Affiliate / sponsored smartlink configuration
const SMARTLINK_URL = "https://omg10.com/4/11016678";
const AFFILIATE_TRACKING_URL = window.AFFILIATE_TRACKING_URL || null;

function trackAffiliateClick(link) {
  try {
    if (AFFILIATE_TRACKING_URL) {
      fetch(AFFILIATE_TRACKING_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link, page: window.location.href, ts: Date.now() }),
      }).catch((err) => console.warn("Affiliate tracking failed", err));
    } else {
      const key = "affiliate_clicks";
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      data[link] = (data[link] || 0) + 1;
      localStorage.setItem(key, JSON.stringify(data));
      console.log("Affiliate click recorded locally", link);
    }
  } catch (err) {
    console.error("Error tracking affiliate click", err);
  }
}

const dom = {
  hero: document.getElementById("hero"),
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),
  searchSuggestions: document.getElementById("search-suggestions"),
  movieGrid: document.getElementById("movie-grid"),
  status: document.getElementById("status"),
  resultsLabel: document.getElementById("results-label"),
  resultsTitle: document.getElementById("results-title"),
  genreRow: document.getElementById("genre-row"),
  featureLabel: document.getElementById("feature-label"),
  statCount: document.getElementById("stat-count"),
  statSection: document.getElementById("stat-section"),
  statRating: document.getElementById("stat-rating"),
  featureMedia: document.getElementById("feature-media"),
  featureTitle: document.getElementById("feature-title"),
  featureOverview: document.getElementById("feature-overview"),
  featureYear: document.getElementById("feature-year"),
  featureRuntime: document.getElementById("feature-runtime"),
  featureScore: document.getElementById("feature-score"),
  featureOpen: document.getElementById("feature-open"),
  clearSearch: document.getElementById("clear-search"),
  pagination: document.getElementById("pagination"),
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  pageIndicator: document.getElementById("page-indicator"),
  featurePanel: document.querySelector(".feature-panel"),
  modal: document.getElementById("movie-modal"),
  modalBody: document.getElementById("modal-body"),
  closeModal: document.getElementById("close-modal"),
};

function assertKey() {
  if (!TMDB_API_KEY || TMDB_API_KEY.includes("PASTE_YOUR")) {
    dom.status.textContent =
      "Add your TMDB API key in script.js, then reload the page to start browsing movies.";
    dom.movieGrid.innerHTML = "";
    return false;
  }
  return true;
}

async function request(path) {
  const url = `${TMDB_BASE}${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(TMDB_API_KEY)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }
  return response.json();
}

function formatYear(dateString) {
  if (!dateString) return "Unknown";
  return new Date(dateString).getFullYear();
}

function formatRuntime(minutes) {
  if (!minutes) return "--";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

function posterUrl(path) {
  if (!path) return POSTER_PLACEHOLDER;
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  return path ? `${IMAGE_BASE}${path}` : POSTER_PLACEHOLDER;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function genreName(ids) {
  if (!ids?.length || !state.genres.length) {
    return state.media === "anime" ? "Anime" : state.media === "tv" ? "Series" : "Movie";
  }
  const selected = state.genres.find((genre) => ids.includes(genre.id));
  return selected?.name ?? (state.media === "anime" ? "Anime" : state.media === "tv" ? "Series" : "Movie");
}

function mediaTypeLabel(mediaType) {
  if (mediaType === "anime") return "Anime";
  return mediaType === "tv" ? "Series" : "Movie";
}

function originLabel(item) {
  const countries = [
    ...(Array.isArray(item.origin_country) ? item.origin_country : []),
    ...(Array.isArray(item.production_countries) ? item.production_countries.map((country) => country.iso_3166_1) : []),
  ].filter(Boolean);
  const language = String(item.original_language || "").toLowerCase();
  const country = countries[0] || "";

  if (countries.includes("KR") || language === "ko") return "Korean";
  if (countries.includes("JP") || language === "ja") return "Japanese";
  if (countries.includes("US")) return "American";
  if (language === "en") return "English";

  const labels = {
    GB: "British",
    CA: "Canadian",
    AU: "Australian",
    IN: "Indian",
    CN: "Chinese",
    FR: "French",
    DE: "German",
    ES: "Spanish",
    IT: "Italian",
    TH: "Thai",
    PH: "Filipino",
    HK: "Hong Kong",
    TW: "Taiwanese",
  };

  return labels[country] || "";
}

function getItemMediaType(item) {
  return item.media_type || (item.title ? "movie" : "tv");
}

function cardTypeLabel(item) {
  const mediaType = getItemMediaType(item);
  if (state.media === "anime") return "Anime";
  if (
    mediaType === "tv" &&
    ((item.original_language || "").toLowerCase() === "ja" ||
      String(item.name || item.title || "").toLowerCase().includes("anime"))
  ) {
    return "Anime";
  }
  return mediaType === "tv" ? "Series" : mediaTypeLabel(mediaType);
}

function isAnimeListingItem(item) {
  if (getItemMediaType(item) === "anime") return true;
  if (getItemMediaType(item) !== "tv") return false;
  const title = String(item.name || item.title || "").toLowerCase();
  const genres = item.genre_ids || [];
  return (
    (item.original_language || "").toLowerCase() === "ja" ||
    genres.includes(16) ||
    title.includes("anime")
  );
}

function isSeriesListingItem(item) {
  return getItemMediaType(item) === "tv" && !isAnimeListingItem(item);
}

function posterTypeLabel(mediaType) {
  return mediaType === "tv" ? "show" : "movie";
}

function getActiveSection() {
  return sections[state.media][state.section];
}

function getTmdbMediaType(mediaType = state.media) {
  return mediaType === "anime" ? "tv" : mediaType;
}

function requestJikan(path) {
  return fetch(`${JIKAN_BASE}${path}`).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Jikan request failed: ${response.status}`);
    }
    return response.json();
  });
}

function parseAnimeRuntime(duration) {
  if (!duration) return null;
  const match = String(duration).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeJikanAnime(item) {
  if (!item) return null;
  const genres = (item.genres || []).map((genre) => genre.mal_id).filter(Boolean);
  const title = item.title || item.title_english || item.title_japanese || "Untitled";
  const image =
    item.images?.jpg?.large_image_url ||
    item.images?.jpg?.image_url ||
    item.images?.webp?.large_image_url ||
    item.images?.webp?.image_url ||
    "";
  const airedDate = item.aired?.from || item.aired?.string || item.published?.from || null;
  return {
    id: item.mal_id,
    mal_id: item.mal_id,
    media_type: "anime",
    title,
    name: title,
    overview: item.synopsis || item.background || "No synopsis available yet.",
    poster_path: image,
    backdrop_path: image,
    vote_average: typeof item.score === "number" ? item.score : null,
    release_date: airedDate,
    first_air_date: airedDate,
    genre_ids: genres,
    genres: (item.genres || []).map((genre) => ({ id: genre.mal_id, name: genre.name })),
    status: item.status,
    runtime: parseAnimeRuntime(item.duration),
    episode_run_time: parseAnimeRuntime(item.duration) ? [parseAnimeRuntime(item.duration)] : [],
    episodes: item.episodes,
    original_language: "ja",
    url: item.url,
    trailer: item.trailer,
    studios: item.studios,
    aired: item.aired,
    images: item.images,
  };
}

function normalizeJikanResults(data) {
  return (data?.data || []).map(normalizeJikanAnime).filter(Boolean);
}

function normalizeQuery(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function suggestionYear(item) {
  return formatYear(item.release_date || item.first_air_date || item.aired?.from || item.aired?.string);
}

function suggestionType(item) {
  return cardTypeLabel(item);
}

function activeGenreName() {
  if (state.genre === "all") return "";
  return state.genres.find((genre) => String(genre.id) === String(state.genre))?.name || "Selected genre";
}

function rankSuggestion(item, query) {
  const title = normalizeQuery(item.title || item.name || "");
  const q = normalizeQuery(query);
  if (!q || !title) return 99;
  if (title === q) return 0;
  if (title.startsWith(q)) return 1;
  if (title.includes(q)) return 2;
  return 3;
}

function renderSearchSuggestions(items) {
  if (!dom.searchSuggestions) return;
  if (!items.length) {
    dom.searchSuggestions.hidden = true;
    dom.searchSuggestions.innerHTML = "";
    return;
  }

  dom.searchSuggestions.hidden = false;
  dom.searchSuggestions.innerHTML = items
    .map((item, index) => {
      const title = item.title || item.name || "Untitled";
      return `
        <button class="search-suggestion" type="button" data-suggestion-index="${index}" data-open="${item.id}" data-media-type="${item.media_type}">
          <span class="search-suggestion-title">${escapeHtml(title)}</span>
          <span class="search-suggestion-meta">${escapeHtml(suggestionType(item))} · ${escapeHtml(suggestionYear(item))}</span>
        </button>
      `;
    })
    .join("");
}

function clearSearchSuggestions() {
  state.searchSuggestions = [];
  state.searchSuggestToken += 1;
  if (!dom.searchSuggestions) return;
  dom.searchSuggestions.hidden = true;
  dom.searchSuggestions.innerHTML = "";
}

async function fetchUnifiedSearch(query, page = 1) {
  const trimmed = String(query || "").trim();
  if (trimmed.length < 2) {
    return { results: [], total_pages: 1 };
  }

  const [tmdbResults, jikanResults] = await Promise.allSettled([
    request(`/search/multi?query=${encodeURIComponent(trimmed)}&page=${page}&include_adult=false`),
    requestJikan(`/anime?q=${encodeURIComponent(trimmed)}&page=${page}&sfw=true`),
  ]);

  const merged = [];
  const seen = new Set();
  const pushItem = (item) => {
    if (!item?.id) return;
    const key = `${item.media_type || "movie"}:${item.id}`;
    if (seen.has(key)) return;
    if (!item.poster_path && !item.backdrop_path) return;
    seen.add(key);
    merged.push(item);
  };

  if (tmdbResults.status === "fulfilled") {
    (tmdbResults.value.results || [])
      .filter((item) => item.media_type !== "person")
      .map((item) => (item.media_type ? item : { ...item, media_type: item.title ? "movie" : "tv" }))
      .forEach(pushItem);
  }

  if (jikanResults.status === "fulfilled") {
    normalizeJikanResults(jikanResults.value).forEach(pushItem);
  }

  const ranked = merged
    .map((item, index) => ({
      ...item,
      _rank: rankSuggestion(item, trimmed),
      _index: index,
    }))
    .sort((a, b) => a._rank - b._rank || a._index - b._index)
    .map(({ _rank, _index, ...item }) => item);

  const totalPages = Math.max(
    tmdbResults.status === "fulfilled" ? tmdbResults.value.total_pages || 1 : 1,
    jikanResults.status === "fulfilled" ? jikanResults.value.pagination?.last_visible_page || 1 : 1
  );

  return {
    results: ranked,
    total_pages: Math.max(1, Math.min(totalPages || 1, 50)),
  };
}

async function loadSearchSuggestions(query) {
  const trimmed = String(query || "").trim();
  const token = ++state.searchSuggestToken;
  if (trimmed.length < 2) {
    state.searchSuggestions = [];
    renderSearchSuggestions([]);
    return;
  }

  try {
    const data = await fetchUnifiedSearch(trimmed, 1);
    if (token !== state.searchSuggestToken) return;
    const ranked = (data.results || []).slice(0, 8);
    state.searchSuggestions = ranked;
    renderSearchSuggestions(ranked);
  } catch (error) {
    console.error(error);
    if (token !== state.searchSuggestToken) return;
    state.searchSuggestions = [];
    renderSearchSuggestions([]);
  }
}

function getNewReleaseWindow() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 365);
  const toYmd = (date) => date.toISOString().slice(0, 10);
  return {
    from: toYmd(start),
    to: toYmd(end),
  };
}

function getRecentWindow(days = 30) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - days);

  const toYmd = (date) => date.toISOString().slice(0, 10);
  return {
    from: toYmd(start),
    to: toYmd(end),
  };
}

function isReleasedItem(item) {
  const rawDate = item.release_date || item.first_air_date || item.aired?.from || item.aired?.string;
  if (item.status && /upcoming|not yet aired|planned|rumored/i.test(String(item.status))) return false;
  if (!rawDate) return true;
  const releaseDate = new Date(rawDate);
  if (Number.isNaN(releaseDate.getTime())) return true;
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return releaseDate <= now;
}

function matchesSelectedGenre(item) {
  if (state.genre === "all") return true;
  const genreIds = (item.genre_ids || []).map(String);
  return genreIds.includes(String(state.genre));
}

function matchesSelectedListingType(item) {
  if (state.media === "anime") return isAnimeListingItem(item);
  if (state.media === "tv") return isSeriesListingItem(item);
  return true;
}

function matchesSelectedBrowseFilters(item) {
  return isReleasedItem(item) && matchesSelectedGenre(item) && matchesSelectedListingType(item);
}

async function loadGenreFeed(page = 1) {
  const pageIndex = Math.max(1, Math.min(Number(page) || 1, 50));
  const genre = String(state.genre || "all");
  if (genre === "all") {
    return null;
  }

  if (state.media === "anime") {
    return loadAnimeFeed(pageIndex, state.section);
  }

  const { from, to } = getNewReleaseWindow();
  const basePath =
    state.media === "movie"
      ? "/discover/movie"
      : "/discover/tv";
  const dateKey = state.media === "movie" ? "primary_release_date" : "first_air_date";
  const extraFilters = state.media === "tv" ? "&without_genres=16" : "";
  const releaseWindow =
    state.section === "new_releases"
      ? `&${dateKey}.gte=${from}&${dateKey}.lte=${to}`
      : `&${dateKey}.lte=${to}`;
  const sortBy =
    state.section === "new_releases"
      ? (state.media === "movie" ? "primary_release_date.desc" : "first_air_date.desc")
      : state.section === "top_rated"
      ? "vote_average.desc"
      : state.section === "now_playing"
        ? (state.media === "movie" ? "primary_release_date.desc" : "first_air_date.desc")
        : state.section === "upcoming"
          ? "popularity.desc"
          : "popularity.desc";

  const path = `${basePath}?with_genres=${encodeURIComponent(genre)}${extraFilters}${releaseWindow}&sort_by=${sortBy}&vote_count.gte=10&page=${pageIndex}`;
  const data = await request(path);
  return {
    ...data,
    results: (data.results || [])
      .filter((item) => item.poster_path || item.backdrop_path)
      .filter(matchesSelectedBrowseFilters),
    total_pages: data.total_pages || 1,
  };
}

function clearFeatureTimers() {
  if (state.featuredTimer) {
    clearInterval(state.featuredTimer);
    state.featuredTimer = null;
  }
  if (state.featuredRefreshTimer) {
    clearInterval(state.featuredRefreshTimer);
    state.featuredRefreshTimer = null;
  }
}

function animateFeaturedSwap() {
  if (!dom.featurePanel) return;
  dom.featurePanel.classList.remove("is-switching");
  void dom.featurePanel.offsetWidth;
  dom.featurePanel.classList.add("is-switching");
  window.setTimeout(() => dom.featurePanel.classList.remove("is-switching"), 600);
}

async function loadFeaturedQueue() {
  const { from, to } = getRecentWindow();
  if (state.media === "anime") {
    const [seasonResponse, topResponse] = await Promise.allSettled([
      requestJikan(`/seasons/now?page=1`),
      requestJikan(`/top/anime?page=1`),
    ]);
    const merged = [];
    const seen = new Set();
    [seasonResponse, topResponse].forEach((response) => {
      if (response.status !== "fulfilled") return;
      normalizeJikanResults(response.value).forEach((item) => {
        const key = `anime:${item.id}`;
        if (seen.has(key)) return;
        if (!item.poster_path && !item.backdrop_path) return;
        seen.add(key);
        merged.push(item);
      });
    });
    state.featuredQueue = merged.slice(0, 6);
    state.featuredIndex = 0;
    return;
  }
  const listEndpoint =
    state.media === "movie"
      ? `/discover/movie?primary_release_date.gte=${from}&primary_release_date.lte=${to}&sort_by=popularity.desc&page=1`
      : `/discover/tv?first_air_date.gte=${from}&first_air_date.lte=${to}&sort_by=popularity.desc&page=1`;

  const data = await request(listEndpoint);
  const picks = (data.results || [])
    .filter((item) => (state.media === "tv" ? isSeriesListingItem(item) : true))
    .slice(0, 6);

  if (!picks.length) {
    state.featuredQueue = [];
    return;
  }

  const details = await Promise.all(
    picks.map(async (item) => {
      try {
        return await request(`/${getTmdbMediaType(state.media)}/${item.id}`);
      } catch (error) {
        console.error(error);
        return null;
      }
    })
  );

  state.featuredQueue = details.filter(Boolean);
  state.featuredIndex = 0;
}

function showFeatured(index = 0) {
  if (!state.featuredQueue.length) return;
  const item = state.featuredQueue[index % state.featuredQueue.length];
  if (!item) return;

  animateFeaturedSwap();
  setHero(item);
  dom.featureOpen.onclick = null;
  dom.featureOpen.dataset.featuredId = item.id;
  dom.featureOpen.dataset.featuredMedia = state.media;
  state.featured = item;
  state.featuredIndex = index % state.featuredQueue.length;
}

function startFeaturedRotation() {
  clearFeatureTimers();

  if (!state.featuredQueue.length) return;

  state.featuredTimer = window.setInterval(() => {
    if (!state.featuredQueue.length) return;
    const nextIndex = (state.featuredIndex + 1) % state.featuredQueue.length;
    showFeatured(nextIndex);
  }, 8000);

  state.featuredRefreshTimer = window.setInterval(() => {
    refreshFeatured().catch((error) => console.error(error));
  }, 30 * 60 * 1000);
}

async function refreshFeatured() {
  await loadFeaturedQueue();
  if (!state.featuredQueue.length) {
    dom.featureMedia.innerHTML = `<div class="feature-placeholder">No recent releases found for this section yet.</div>`;
    dom.featureTitle.textContent = "Nothing recent yet";
    dom.featureOverview.textContent = "Check back soon for new arrivals.";
    dom.featureYear.textContent = "--";
    dom.featureRuntime.textContent = "-- min";
    dom.featureScore.textContent = "-- / 10";
    return;
  }

  showFeatured(0);
  startFeaturedRotation();
}

function updateStats() {
  dom.statCount.textContent = String(state.currentMovies.length || 0).padStart(2, "0");
  dom.statSection.textContent =
    state.media === "movie" ? "Movies" : state.media === "anime" ? "Anime" : "Series";
  dom.statRating.textContent = state.searchTerm ? "Search" : state.media === "anime" ? "Jikan" : "TMDB";
  dom.pageIndicator.textContent = `Page ${state.currentPage} of ${state.totalPages || 1}`;
  dom.prevPage.disabled = state.currentPage <= 1;
  dom.nextPage.disabled = state.currentPage >= (state.totalPages || 1);
}

function renderGenres() {
  const chips = [
    `<button class="pill ${state.genre === "all" ? "active" : ""}" data-genre="all">All</button>`,
    ...state.genres.map(
      (genre) =>
        `<button class="pill ${state.genre === String(genre.id) ? "active" : ""}" data-genre="${genre.id}">${escapeHtml(genre.name)}</button>`
    ),
  ];
  dom.genreRow.innerHTML = chips.join("");
}

function createMovieCard(movie) {
  const title = movie.title || movie.name || "Untitled";
  const overview = movie.overview || "No overview available for this title yet.";
  const year = formatYear(movie.release_date || movie.first_air_date);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";
  const origin = originLabel(movie);

  return `
    <article class="movie-card" data-id="${movie.id}">
      <div class="poster-wrap">
        <img loading="lazy" src="${posterUrl(movie.poster_path)}" alt="${escapeHtml(title)} poster" />
        <span class="rating-badge">★ ${rating}</span>
        ${origin ? `<span class="origin-badge">${escapeHtml(origin)}</span>` : ""}
      </div>
      <div class="movie-card-body">
        <h3>${escapeHtml(title)}</h3>
        <div class="card-meta">
          <span>${year}</span>
          <span>${escapeHtml(genreName(movie.genre_ids))}</span>
        </div>
        <p class="card-overview">${escapeHtml(overview)}</p>
        <button class="open-details" data-open="${movie.id}">View details</button>
      </div>
    </article>
  `;
}

function createSearchResultCard(movie) {
  const title = movie.title || movie.name || "Untitled";
  const overview = movie.overview || "No overview available for this title yet.";
  const year = formatYear(movie.release_date || movie.first_air_date);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";
  const mediaType = state.media === "anime" ? "anime" : getItemMediaType(movie);
  const origin = originLabel(movie);

  return `
    <article class="movie-card" data-id="${movie.id}">
      <div class="poster-wrap">
        <img loading="lazy" src="${posterUrl(movie.poster_path)}" alt="${escapeHtml(title)} poster" />
        <span class="rating-badge">${cardTypeLabel(movie)} · ★ ${rating}</span>
        ${origin ? `<span class="origin-badge">${escapeHtml(origin)}</span>` : ""}
      </div>
      <div class="movie-card-body">
        <h3>${escapeHtml(title)}</h3>
        <div class="card-meta">
          <span>${year}</span>
          <span>${escapeHtml(genreName(movie.genre_ids))}</span>
        </div>
        <p class="card-overview">${escapeHtml(overview)}</p>
        <button class="open-details" data-open="${movie.id}" data-media-type="${mediaType}">View details</button>
      </div>
    </article>
  `;
}

function renderMovies(movies) {
  state.currentMovies = movies;
  dom.movieGrid.innerHTML = movies.length
    ? movies.map(createSearchResultCard).join("")
    : `<div class="status">No movies found. Try a different search or filter.</div>`;
  updateStats();
}

function createShelfCard(item, mediaType = state.media) {
  const title = item.title || item.name || "Untitled";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : "N/A";
  const year = formatYear(item.release_date || item.first_air_date);
  const origin = originLabel(item);
  return `
    <article class="shelf-card" data-open="${item.id}" data-media-type="${mediaType}">
      <img loading="lazy" src="${posterUrl(item.poster_path)}" alt="${escapeHtml(title)} poster" />
      <div class="shelf-card-copy">
        <h3>${escapeHtml(title)}</h3>
        <div class="shelf-card-meta">
          <span>${year}</span>
          <span>★ ${rating}</span>
          ${origin ? `<span>${escapeHtml(origin)}</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderShelf(rowEl, items, mediaType = state.media) {
  if (!rowEl) return;
  rowEl.innerHTML = items.length
    ? items.map((item) => createShelfCard(item, mediaType)).join("")
    : `<div class="shelf-empty">Nothing to show right now.</div>`;
}

async function loadShelf(rowEl, path, mediaType = state.media, limit = 10) {
  if (!rowEl) return;
  rowEl.innerHTML = Array.from({ length: 6 })
    .map(() => `<div class="shelf-card skeleton shelf-skeleton"></div>`)
    .join("");

  try {
    const data = await request(path);
    const items = (data.results || [])
      .filter((item) => item.media_type !== "person")
      .map((item) => (item.media_type ? item : { ...item, media_type: mediaType }))
      .filter((item) => item.poster_path || item.backdrop_path)
      .slice(0, limit);
    renderShelf(rowEl, items, mediaType);
  } catch (error) {
    console.error(error);
    renderShelf(rowEl, [], mediaType);
  }
}

function setStatus(message) {
  dom.status.textContent = message;
}

function setLoadingSkeleton() {
  dom.movieGrid.innerHTML = Array.from({ length: 8 })
    .map(
      () => `
      <article class="movie-card">
        <div class="poster-wrap skeleton"></div>
        <div class="movie-card-body">
          <div class="skeleton" style="height: 20px; border-radius: 10px;"></div>
          <div class="skeleton" style="height: 14px; width: 70%; border-radius: 999px;"></div>
          <div class="skeleton" style="height: 56px; border-radius: 12px;"></div>
          <div class="skeleton" style="height: 40px; border-radius: 12px;"></div>
        </div>
      </article>
    `
    )
    .join("");
}

function setHero(movie) {
  state.featured = movie;
  dom.featureTitle.textContent = movie.title || movie.name || "Featured title";
  dom.featureOverview.textContent = movie.overview || "This featured title is ready for you to explore.";
  dom.featureYear.textContent = String(formatYear(movie.release_date || movie.first_air_date));
  dom.featureRuntime.textContent = `${formatRuntime(movie.runtime || movie.episode_run_time?.[0])} runtime`;
  dom.featureScore.textContent = movie.vote_average ? `${movie.vote_average.toFixed(1)} / 10` : "-- / 10";
  dom.featureLabel.textContent =
    state.media === "movie"
      ? "Fresh movie spotlight"
      : state.media === "anime"
        ? "Fresh anime spotlight"
        : "Fresh series spotlight";
  dom.featureMedia.innerHTML = movie.backdrop_path
    ? `<img src="${posterUrl(movie.backdrop_path)}" alt="${escapeHtml(movie.title || movie.name)} backdrop" />`
    : `<div class="feature-placeholder">No backdrop available for this title.</div>`;
}

async function loadGenres() {
  if (state.media === "anime") {
    const data = await requestJikan(`/genres/anime`);
    state.genres = (data.data || []).map((genre) => ({ id: genre.mal_id, name: genre.name }));
  } else {
    const data = await request(`/genre/${getTmdbMediaType()}/list`);
    state.genres = data.genres || [];
  }
  renderGenres();
}

async function loadFeaturedMovie() {
  await refreshFeatured();
}

async function loadMovies() {
  const active = getActiveSection();
  state.searchTerm = dom.searchInput.value.trim();
  dom.clearSearch.hidden = !state.searchTerm;
  dom.resultsLabel.textContent = state.searchTerm ? "All search results" : active.label;
  dom.resultsTitle.textContent = state.searchTerm
    ? `Results for "${state.searchTerm}"`
    : state.genre !== "all"
      ? `${activeGenreName()} picks`
    : state.section === "new_releases"
      ? "Trending now"
      : `Browse ${active.label.toLowerCase()}`;

  setStatus("Loading titles...");
  setLoadingSkeleton();

  try {
    let data;
    let totalPages = 1;
    if (state.searchTerm) {
      data = await fetchUnifiedSearch(state.searchTerm, state.currentPage);
      totalPages = data.total_pages || 1;
    } else if (state.genre !== "all") {
      data = await loadGenreFeed(state.currentPage);
      if (!data) data = await request(`${active.endpoint}?page=${state.currentPage}`);
      totalPages = data.total_pages || 1;
    } else if (state.media === "anime") {
      data = await loadAnimeFeed(state.currentPage, state.section, state.searchTerm);
      totalPages = data.total_pages || 1;
    } else if (state.section === "new_releases") {
      data = await loadTrendingFeed(state.currentPage);
      totalPages = data.total_pages || 1;
    } else {
      data = await request(`${active.endpoint}?page=${state.currentPage}`);
      totalPages = data.total_pages || 1;
    }

    const sourceMovies = (data.results || [])
      .filter((movie) => movie.media_type !== "person")
      .map((movie) =>
        state.searchTerm && !movie.media_type ? { ...movie, media_type: movie.title ? "movie" : "tv" } : movie
      )
      .filter((movie) => movie.poster_path || movie.backdrop_path);
    const filteredMovies =
      state.searchTerm
        ? sourceMovies.filter((movie) => matchesSelectedGenre(movie))
        : state.media === "anime"
        ? sourceMovies.filter(matchesSelectedBrowseFilters)
        : state.media === "tv"
          ? sourceMovies.filter(matchesSelectedBrowseFilters)
          : sourceMovies.filter(matchesSelectedBrowseFilters);
    state.totalPages = Math.max(1, Math.min(totalPages || 1, 500));
    renderMovies(filteredMovies);
    setStatus(
      filteredMovies.length
        ? `Showing ${filteredMovies.length} results.`
        : "No titles matched your filters."
    );
    updateStats();
  } catch (error) {
    console.error(error);
    setStatus("We could not load catalog data right now. Check your connection and API setup.");
    dom.movieGrid.innerHTML = "";
  }
}

async function loadAnimeFeed(page = 1, section = "new_releases", searchTerm = "") {
  const pageIndex = Math.max(1, Math.min(Number(page) || 1, 50));
  const seen = new Set();
  const merged = [];
  const genreFilter = state.genre !== "all" ? String(state.genre) : null;

  if (searchTerm) {
    const data = await requestJikan(`/anime?q=${encodeURIComponent(searchTerm)}&page=${pageIndex}&sfw=true`);
    const results = normalizeJikanResults(data)
      .filter((item) => item.poster_path || item.backdrop_path)
      .filter((item) => (genreFilter ? (item.genre_ids || []).map(String).includes(genreFilter) : true));
    return {
      results,
      total_pages: Math.max(1, Math.min(data.pagination?.last_visible_page || 1, 50)),
    };
  }

  const sectionPaths = {
    new_releases: [
      `/seasons/now?page=${pageIndex}`,
      `/top/anime?page=${pageIndex}`,
    ],
    popular: [`/top/anime?page=${pageIndex}`],
    top_rated: [`/top/anime?page=${pageIndex}`],
    now_playing: [`/seasons/now?page=${pageIndex}`],
    upcoming: [`/top/anime?page=${pageIndex}`],
  };

  const isCurrentYear = (item) => {
    const year = new Date(item.release_date || item.first_air_date || "").getFullYear();
    return !Number.isNaN(year) && year === new Date().getFullYear();
  };

  const responses = await Promise.allSettled((sectionPaths[section] || sectionPaths.new_releases).map((path) => requestJikan(path)));
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const item of normalizeJikanResults(response.value)) {
      const key = `anime:${item.id}`;
      if (seen.has(key)) continue;
      if (!item.poster_path && !item.backdrop_path) continue;
      if (item.status && String(item.status).toLowerCase().includes("not yet aired")) continue;
      if (section === "new_releases" && !isCurrentYear(item)) continue;
      if (genreFilter && !(item.genre_ids || []).map(String).includes(genreFilter)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  merged.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));

  return {
    results: merged.slice(0, 20),
    total_pages: 50,
  };
}

async function loadTrendingFeed(page = 1) {
  const { from, to } = getNewReleaseWindow();
  const since = from;
  const until = to;
  const genreFilter = state.genre !== "all" ? `&with_genres=${encodeURIComponent(state.genre)}` : "";
  const pageIndex = Math.max(1, Math.min(Number(page) || 1, 50));
  if (state.media === "anime") {
    return loadAnimeFeed(pageIndex, state.section);
  }
  const paths =
    state.media === "movie"
      ? [
          `/discover/movie?primary_release_date.gte=${since}&primary_release_date.lte=${until}${genreFilter}&sort_by=primary_release_date.desc&page=${pageIndex}`,
          `/discover/movie?primary_release_date.gte=${since}&primary_release_date.lte=${until}&sort_by=popularity.desc&page=${pageIndex}`,
        ]
      : [
          `/discover/tv?first_air_date.gte=${since}&first_air_date.lte=${until}&without_genres=16${genreFilter}&sort_by=first_air_date.desc&page=${pageIndex}`,
          `/discover/tv?first_air_date.gte=${since}&first_air_date.lte=${until}&without_genres=16${genreFilter}&sort_by=popularity.desc&page=${pageIndex}`,
        ];

  const responses = await Promise.allSettled(paths.map((path) => request(path)));
  const seen = new Set();
  const merged = [];

  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const item of response.value.results || []) {
      const mediaType = item.media_type || (item.title ? "movie" : "tv");
      const key = `${mediaType}:${item.id}`;
      if (seen.has(key)) continue;
      if (!item.poster_path && !item.backdrop_path) continue;
      if (state.media === "tv" && !isSeriesListingItem(item)) continue;
      seen.add(key);
      merged.push({
        ...item,
        media_type: mediaType,
      });
    }
  }

  merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  return {
    results: merged.slice(0, 20),
    total_pages: 50,
  };
}

async function openMovie(movieId) {
  try {
    dom.modalBody.innerHTML = `<div class="status">Loading movie details...</div>`;
    dom.modal.showModal();

    const data = await request(`/${state.media}/${movieId}?append_to_response=videos,credits`);
    const cast = (data.credits?.cast || []).slice(0, 8);
    const trailers = (data.videos?.results || []).filter(
      (video) => video.site === "YouTube" && video.type === "Trailer"
    );
    const trailer = trailers[0];
    const genres = (data.genres || []).map((genre) => `<span>${escapeHtml(genre.name)}</span>`).join("");
    const castHtml = cast.map((person) => `<span>${escapeHtml(person.name)}</span>`).join("");

    dom.modalBody.innerHTML = `
      <div class="modal-poster">
        <img src="${posterUrl(data.poster_path)}" alt="${escapeHtml(data.title || data.name)} poster" />
      </div>
      <div class="modal-copy">
        <p class="eyebrow">${escapeHtml(data.tagline || "TMDB movie details")}</p>
        <h2>${escapeHtml(data.title || data.name)}</h2>
        <div class="meta-line">
          <span class="meta-pill">${formatYear(data.release_date || data.first_air_date)}</span>
          <span class="meta-pill">${formatRuntime(data.runtime || data.episode_run_time?.[0])}</span>
          <span class="meta-pill">★ ${data.vote_average ? data.vote_average.toFixed(1) : "N/A"}</span>
          <span class="meta-pill">${escapeHtml(data.status || "Released")}</span>
        </div>
        <p>${escapeHtml(data.overview || "No description is available for this title.")}</p>
        <div class="genre-list">${genres || "<span>Movie</span>"}</div>
        <div class="cast-list">${castHtml || "<span>Cast unavailable</span>"}</div>
        <div class="modal-actions">
          ${
            trailer
              ? `<a class="primary" href="https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}" target="_blank" rel="noreferrer">Watch trailer</a>`
              : ""
          }
          ${getSponsoredLinkMarkup()}
          <a class="secondary" href="https://www.themoviedb.org/${state.media}/${data.id}" target="_blank" rel="noreferrer">Open on TMDB</a>
        </div>
      </div>
    `;
  } catch (error) {
    console.error(error);
    dom.modalBody.innerHTML = `<div class="status">Could not load this movie right now.</div>`;
    dom.modal.showModal();
  }
}

function providerLinksFor(providerData) {
  const region = providerData.US || providerData.NG || Object.values(providerData)[0];
  const providers = region?.flatrate || region?.rent || region?.buy || [];

  return providers
    .map((provider) => {
      const homepage = providerHomepages[provider.provider_name];
      if (!homepage) return null;
      return `<a class="provider-pill" href="${homepage}" target="_blank" rel="noreferrer">Watch on ${escapeHtml(provider.provider_name)}</a>`;
    })
    .filter(Boolean)
    .join("");
}

function isAnimeTitle(data) {
  // True anime: Japanese language AND (has anime or animation genre)
  const genres = (data.genres || []).map((g) => String(g.name).toLowerCase());
  const isJapanese = data.original_language === "ja";
  const hasAnimationGenre = genres.includes("animation") || genres.includes("anime");
  
  // Only return true for Japanese anime, not Western cartoons
  return isJapanese && hasAnimationGenre;
}

function getStreamingLinksFor(data, mediaType) {
  const title = (data.title || data.name || data.original_title || data.original_name || "").trim();
  const query = title ? encodeURIComponent(title) : "";
  const downloaderUrl = query ? `https://videodownloader.site/?q=${query}` : "https://videodownloader.site";

  if (mediaType === "anime") {
    return `
      <a class="provider-pill" href="https://animepahe.pw" target="_blank" rel="noreferrer">animepahe</a>
      <a class="provider-pill" href="https://kisskh.do" target="_blank" rel="noreferrer">kisskh</a>
      <a class="provider-pill" href="${downloaderUrl}">Download Movie</a>
    `;
  }

  return `
    <a class="provider-pill" href="${downloaderUrl}">Download Movie</a>
  `;
}

function getSponsoredLinkMarkup() {
  return `
    <a class="secondary sponsored" href="${SMARTLINK_URL}" target="_blank" rel="noreferrer sponsored">
      Open Sponsored Offer
    </a>
  `;
}

async function openTitle(movieId, mediaType = state.media) {
  try {
    dom.modalBody.innerHTML = `<div class="status">Loading title details...</div>`;
    dom.modal.showModal();

    if (mediaType === "anime") {
      let animeResponse;
      try {
        animeResponse = await requestJikan(`/anime/${movieId}/full`);
      } catch (error) {
        animeResponse = await requestJikan(`/anime/${movieId}`);
      }
      const anime = normalizeJikanAnime(animeResponse.data || animeResponse);
      const genres = (anime.genres || []).map((genre) => `<span>${escapeHtml(genre.name)}</span>`).join("");
      const studios = (anime.studios || []).map((studio) => `<span>${escapeHtml(studio.name)}</span>`).join("");
      const trailerId = anime.trailer?.youtube_id;
      const trailerMarkup = trailerId
        ? `<a class="primary" href="https://www.youtube.com/watch?v=${encodeURIComponent(trailerId)}" target="_blank" rel="noreferrer">Watch trailer</a>`
        : "";

      dom.modalBody.innerHTML = `
        <div class="modal-poster">
          <img src="${posterUrl(anime.poster_path)}" alt="${escapeHtml(anime.title)} poster" />
        </div>
        <div class="modal-copy">
          <p class="eyebrow">${escapeHtml(anime.status || "Anime details")}</p>
          <h2>${escapeHtml(anime.title)}</h2>
          <div class="meta-line">
            <span class="meta-pill">${escapeHtml(anime.release_date ? formatYear(anime.release_date) : anime.aired?.string || "--")}</span>
            <span class="meta-pill">${anime.episodes ? `${anime.episodes} eps` : "Episodes unknown"}</span>
            <span class="meta-pill">★ ${anime.vote_average ? anime.vote_average.toFixed(1) : "N/A"}</span>
            <span class="meta-pill">${escapeHtml(anime.status || "Released")}</span>
          </div>
          <p>${escapeHtml(anime.overview || "No synopsis is available for this anime.")}</p>
          <div class="genre-list">${genres || "<span>Anime</span>"}</div>
          <div class="cast-list">${studios || "<span>Studio unavailable</span>"}</div>
          <div class="watch-section">
            <h3>Download in</h3>
            <div class="provider-grid">
              ${getStreamingLinksFor(anime, mediaType)}
            </div>
          </div>
          <div class="watch-section">
            <h3>Watch on official platforms</h3>
            <div class="provider-grid">
              ${anime.url ? `<a class="provider-pill" href="${anime.url}" target="_blank" rel="noreferrer">Open on MyAnimeList</a>` : `<span class="provider-empty">No official link available.</span>`}
            </div>
          </div>
          <div class="modal-actions">
            ${trailerMarkup}
            ${getSponsoredLinkMarkup()}
            <a class="secondary" href="${anime.url || "https://myanimelist.net"}" target="_blank" rel="noreferrer">Open source page</a>
          </div>
        </div>
      `;

      const sponsoredEls = dom.modalBody.querySelectorAll(".sponsored");
      sponsoredEls.forEach((el) => {
        el.addEventListener("click", (evt) => {
          evt.preventDefault();
          const href = el.getAttribute("href") || SMARTLINK_URL;
          trackAffiliateClick(href);
          window.open(href, "_blank", "noopener");
        });
      });
      return;
    }

    const requestMedia = getTmdbMediaType(mediaType);
    const [data, providerData] = await Promise.all([
      request(`/${requestMedia}/${movieId}?append_to_response=videos,credits`),
      request(`/${requestMedia}/${movieId}/watch/providers`),
    ]);
    const cast = (data.credits?.cast || []).slice(0, 8);
    const trailers = (data.videos?.results || []).filter(
      (video) => video.site === "YouTube" && video.type === "Trailer"
    );
    const trailer = trailers[0];
    const genres = (data.genres || []).map((genre) => `<span>${escapeHtml(genre.name)}</span>`).join("");
    const castHtml = cast.map((person) => `<span>${escapeHtml(person.name)}</span>`).join("");
    const providerHtml = providerLinksFor(providerData.results || {});
    const title = data.title || data.name || "Untitled";

    dom.modalBody.innerHTML = `
      <div class="modal-poster">
        <img src="${posterUrl(data.poster_path)}" alt="${escapeHtml(title)} poster" />
      </div>
      <div class="modal-copy">
        <p class="eyebrow">${escapeHtml(data.tagline || `${mediaTypeLabel(mediaType)} details`)}</p>
        <h2>${escapeHtml(title)}</h2>
        <div class="meta-line">
          <span class="meta-pill">${formatYear(data.release_date || data.first_air_date)}</span>
          <span class="meta-pill">${formatRuntime(data.runtime || data.episode_run_time?.[0])}</span>
          <span class="meta-pill">★ ${data.vote_average ? data.vote_average.toFixed(1) : "N/A"}</span>
          <span class="meta-pill">${escapeHtml(data.status || "Released")}</span>
        </div>
        <p>${escapeHtml(data.overview || "No description is available for this title.")}</p>
        <div class="genre-list">${genres || `<span>${mediaTypeLabel(mediaType)}</span>`}</div>
        <div class="cast-list">${castHtml || "<span>Cast unavailable</span>"}</div>
        <div class="watch-section">
          <h3>${mediaType === "anime" ? "Download here" : "Download movie"}</h3>
          <p class="sponsor-disclosure">This sponsored link opens in a new tab and helps support the site. Click only if you want to proceed.</p>
          <div class="provider-grid">
            ${getStreamingLinksFor(data, mediaType)}
          </div>
        </div>
        <div class="watch-section">
          <h3>Watch on official platforms</h3>
          <div class="provider-grid">
            ${providerHtml || `<span class="provider-empty">No official provider found in your region yet.</span>`}
          </div>
        </div>
        <div class="modal-actions">
          ${
            trailer
              ? `<a class="primary" href="https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}" target="_blank" rel="noreferrer">Watch trailer</a>`
              : ""
          }
          ${getSponsoredLinkMarkup()}
          <a class="secondary" href="https://www.themoviedb.org/${requestMedia}/${data.id}" target="_blank" rel="noreferrer">Open on TMDB</a>
        </div>
      </div>
    `;

    // Attach click handlers for sponsored links (explicit opt-in)
    const sponsoredEls = dom.modalBody.querySelectorAll('.sponsored');
    sponsoredEls.forEach((el) => {
      el.addEventListener('click', (evt) => {
        evt.preventDefault();
        const href = el.getAttribute('href') || SMARTLINK_URL;
        trackAffiliateClick(href);
        window.open(href, '_blank', 'noopener');
      });
    });
  } catch (error) {
    console.error(error);
    dom.modalBody.innerHTML = `<div class="status">Could not load this title right now.</div>`;
    dom.modal.showModal();
  }
}

function wireEvents() {
  document.querySelectorAll("[data-media]").forEach((button) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll("[data-media]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.media = button.dataset.media;
      state.section = "new_releases";
      state.genre = "all";
      state.searchTerm = "";
      state.currentPage = 1;
      state.totalPages = 1;
      dom.searchInput.value = "";
      dom.clearSearch.hidden = true;
      clearSearchSuggestions();
      document.querySelectorAll("[data-section]").forEach((item, index) => {
        item.classList.toggle("active", index === 0);
      });
      updateSectionButtonLabels();
      await refreshData();
    });
  });

  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-section]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.section = button.dataset.section;
      state.genre = "all";
      state.currentPage = 1;
      clearSearchSuggestions();
      renderGenres();
      loadMovies();
    });
  });

  dom.genreRow.addEventListener("click", (event) => {
    const target = event.target.closest("[data-genre]");
    if (!target || target.classList.contains("pill-muted")) return;
    state.genre = target.dataset.genre;
    renderGenres();
    loadMovies();
  });

  dom.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.currentPage = 1;
    clearSearchSuggestions();
    loadMovies();
  });

  dom.searchInput.addEventListener("input", () => {
    const query = dom.searchInput.value.trim();
    if (!query) {
      clearSearchSuggestions();
      return;
    }
    window.clearTimeout(state.searchSuggestTimer);
    state.searchSuggestTimer = window.setTimeout(() => {
      loadSearchSuggestions(query).catch((error) => console.error(error));
    }, 220);
  });

  dom.searchInput.addEventListener("focus", () => {
    if (state.searchSuggestions.length) {
      renderSearchSuggestions(state.searchSuggestions);
    }
  });

  dom.clearSearch.addEventListener("click", () => {
    dom.searchInput.value = "";
    state.searchTerm = "";
    dom.clearSearch.hidden = true;
    state.currentPage = 1;
    clearSearchSuggestions();
    loadMovies();
  });

  dom.prevPage.addEventListener("click", () => {
    if (state.currentPage <= 1) return;
    state.currentPage -= 1;
    loadMovies();
  });

  dom.nextPage.addEventListener("click", () => {
    if (state.currentPage >= state.totalPages) return;
    state.currentPage += 1;
    loadMovies();
  });

  dom.featureOpen.addEventListener("click", () => {
    if (!state.featured?.id) return;
    openTitle(state.featured.id, state.media);
  });

  dom.movieGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open]");
    if (!button) return;
    openTitle(button.dataset.open, button.dataset.mediaType || state.media);
  });

  dom.searchSuggestions?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-suggestion-index]");
    if (!button) return;
    const index = Number(button.dataset.suggestionIndex);
    const selected = state.searchSuggestions[index];
    if (!selected) return;
    dom.searchInput.value = selected.title || selected.name || "";
    state.currentPage = 1;
    clearSearchSuggestions();
    loadMovies();
  });

  dom.closeModal.addEventListener("click", () => dom.modal.close());
  dom.modal.addEventListener("click", (event) => {
    const rect = dom.modal.getBoundingClientRect();
    const clickedOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (clickedOutside) dom.modal.close();
  });

  document.addEventListener("click", (event) => {
    const clickedSearch = event.target.closest?.(".search-bar") || event.target.closest?.(".search-suggestions");
    if (!clickedSearch) {
      clearSearchSuggestions();
    }
  });
}

function updateSectionButtonLabels() {
  const labels =
    state.media === "movie"
      ? ["Trending Now", "Popular", "Top Rated", "Now Playing", "Upcoming"]
      : state.media === "anime"
        ? ["Trending Now", "Popular Anime", "Top Rated Anime", "Recent Anime", "More Anime"]
        : ["Trending Now", "Popular Series", "Top Rated Series", "Airing Today", "On The Air"];
  document.querySelectorAll("[data-section]").forEach((button, index) => {
    button.textContent = labels[index] || button.textContent;
  });
  dom.searchInput.placeholder =
    state.media === "movie"
      ? "Search movies, TV shows, and franchises"
      : state.media === "anime"
        ? "Search anime, series, and cartoons"
        : "Search series, movies, and franchises";
  dom.featureMedia.innerHTML = `<div class="feature-placeholder">Loading featured ${
    state.media === "movie" ? "movie" : state.media === "anime" ? "anime" : "series"
  }...</div>`;
  dom.featureLabel.textContent =
    state.media === "movie"
      ? "Fresh movie spotlight"
      : state.media === "anime"
        ? "Fresh anime spotlight"
        : "Fresh series spotlight";
}

async function refreshData() {
  renderGenres();
  setStatus("Loading catalog data...");
  await Promise.all([loadGenres(), loadFeaturedMovie()]);
  await loadMovies();
  clearTimeout(refreshData._timer);
  refreshData._timer = window.setTimeout(() => {
    refreshData().catch((error) => console.error(error));
  }, 60 * 60 * 1000);
}

async function bootstrap() {
  if (!assertKey()) return;
  wireEvents();
  updateSectionButtonLabels();
  renderGenres();
  setStatus("Loading catalog data...");

  try {
    await refreshData();
  } catch (error) {
    console.error(error);
    setStatus("Something went wrong while initializing the app.");
  }
}

bootstrap();
