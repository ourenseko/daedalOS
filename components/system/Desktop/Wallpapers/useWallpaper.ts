import hexells from "components/system/Desktop/Wallpapers/hexells";
import coastalLandscape from "components/system/Desktop/Wallpapers/ShaderToy/CoastalLandscape";
import vantaWaves from "components/system/Desktop/Wallpapers/vantaWaves";
import { config } from "components/system/Desktop/Wallpapers/vantaWaves/config";
import { useFileSystem } from "contexts/fileSystem";
import { useSession } from "contexts/session";
import type { WallpaperFit } from "contexts/session/types";
import useWorker from "hooks/useWorker";
import { useCallback, useEffect, useMemo } from "react";
import { MILLISECONDS_IN_DAY } from "utils/constants";
import {
  bufferToUrl,
  cleanUpBufferUrl,
  createOffscreenCanvas,
  getYouTubeUrlId,
  isYouTubeUrl,
  jsonFetch,
  viewWidth,
} from "utils/functions";

const cssFit: Record<WallpaperFit, string> = {
  center: "background-repeat: no-repeat;",
  fill: "background-size: cover;",
  fit: `
    background-repeat: no-repeat;
    background-size: contain;
  `,
  stretch: "background-size: 100% 100%;",
  tile: "",
};

const BRIGHT_WALLPAPERS: Record<string, `${number}%`> = {
  COASTAL_LANDSCAPE: "80%",
  HEXELLS: "80%",
};

const WALLPAPER_WORKERS: Record<string, (info?: string) => Worker> = {
  COASTAL_LANDSCAPE: (): Worker =>
    new Worker(
      new URL(
        "components/system/Desktop/Wallpapers/ShaderToy/CoastalLandscape/wallpaper.worker",
        import.meta.url
      ),
      { name: "Wallpaper (Coastal Landscape)" }
    ),
  HEXELLS: (): Worker =>
    new Worker(
      new URL(
        "components/system/Desktop/Wallpapers/hexells/wallpaper.worker",
        import.meta.url
      ),
      { name: "Wallpaper (Hexells)" }
    ),
  VANTA: (info?: string): Worker =>
    new Worker(
      new URL(
        "components/system/Desktop/Wallpapers/vantaWaves/wallpaper.worker",
        import.meta.url
      ),
      { name: `Wallpaper (Vanta Waves)${info ? ` [${info}]` : ""}` }
    ),
};

const BASE_CANVAS_SELECTOR = ":scope > canvas";

const useWallpaper = (
  desktopRef: React.MutableRefObject<HTMLElement | null>
): void => {
  const { exists, readFile } = useFileSystem();
  const { sessionLoaded, setWallpaper, wallpaperImage, wallpaperFit } =
    useSession();
  const [wallpaperName] = wallpaperImage.split(" ");
  const vantaWireframe = wallpaperImage === "VANTA WIREFRAME";
  const wallpaperWorker = useWorker<void>(
    WALLPAPER_WORKERS[wallpaperName],
    undefined,
    vantaWireframe ? "Wireframe" : ""
  );
  const resizeListener = useCallback(() => {
    if (!desktopRef.current) return;

    const desktopRect = desktopRef.current.getBoundingClientRect();

    wallpaperWorker.current?.postMessage(desktopRect);

    const canvasElement =
      desktopRef.current.querySelector(BASE_CANVAS_SELECTOR);

    if (canvasElement instanceof HTMLCanvasElement) {
      canvasElement.style.width = `${desktopRect.width}px`;
      canvasElement.style.height = `${desktopRect.height}px`;
    }
  }, [desktopRef, wallpaperWorker]);
  const vantaConfig = useMemo(() => {
    const newConfig = { ...config };

    newConfig.material.options.wireframe = vantaWireframe;

    return newConfig;
  }, [vantaWireframe]);
  const loadWallpaper = useCallback(() => {
    if (desktopRef.current) {
      desktopRef.current.setAttribute("style", "");
      desktopRef.current.querySelector(BASE_CANVAS_SELECTOR)?.remove();

      if (
        typeof window.OffscreenCanvas !== "undefined" &&
        wallpaperWorker.current
      ) {
        const offscreen = createOffscreenCanvas(desktopRef.current);

        wallpaperWorker.current.postMessage(
          {
            canvas: offscreen,
            config: wallpaperName === "VANTA" ? vantaConfig : undefined,
            devicePixelRatio: 1,
          },
          [offscreen]
        );

        window.removeEventListener("resize", resizeListener);
        window.addEventListener("resize", resizeListener, { passive: true });
      } else if (wallpaperName === "VANTA") {
        vantaWaves(vantaConfig)(desktopRef.current);
      } else if (wallpaperName === "HEXELLS") {
        hexells(desktopRef.current);
      } else if (wallpaperName === "COASTAL_LANDSCAPE") {
        coastalLandscape(desktopRef.current);
      } else {
        setWallpaper("VANTA");
      }

      if (BRIGHT_WALLPAPERS[wallpaperName]) {
        desktopRef.current
          ?.querySelector(BASE_CANVAS_SELECTOR)
          ?.setAttribute(
            "style",
            `filter: brightness(${BRIGHT_WALLPAPERS[wallpaperName]})`
          );
      }
    }
  }, [
    desktopRef,
    resizeListener,
    setWallpaper,
    vantaConfig,
    wallpaperName,
    wallpaperWorker,
  ]);
  const loadFileWallpaper = useCallback(async () => {
    const [, currentWallpaperUrl] =
      desktopRef.current?.style.backgroundImage.match(/"(.*?)"/) || [];

    if (currentWallpaperUrl === wallpaperImage) return;
    if (currentWallpaperUrl) cleanUpBufferUrl(currentWallpaperUrl);
    desktopRef.current?.setAttribute("style", "");
    desktopRef.current?.querySelector(BASE_CANVAS_SELECTOR)?.remove();
    if (wallpaperName === "VANTA") {
      vantaWaves(vantaConfig)();
    }

    let wallpaperUrl = "";
    let fallbackBackground = "";
    let newWallpaperFit = wallpaperFit;

    if (wallpaperName === "APOD") {
      const [, currentUrl, currentDate] = wallpaperImage.split(" ");
      const [month, , day, , year] = new Intl.DateTimeFormat("en-US", {
        timeZone: "US/Eastern",
      })
        .formatToParts(Date.now())
        .map(({ value }) => value);

      if (currentDate === `${year}-${month}-${day}`) {
        wallpaperUrl = currentUrl;
      } else {
        const {
          date = "",
          hdurl = "",
          url = "",
        } = await jsonFetch(
          "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY"
        );

        if (hdurl || url) {
          wallpaperUrl = ((viewWidth() > 1024 ? hdurl : url) || url) as string;
          newWallpaperFit = "fit";

          if (isYouTubeUrl(wallpaperUrl)) {
            wallpaperUrl = `https://i.ytimg.com/vi/${getYouTubeUrlId(
              wallpaperUrl
            )}/maxresdefault.jpg`;
          }

          if (hdurl && url && hdurl !== url) {
            fallbackBackground = (wallpaperUrl === url ? hdurl : url) as string;
          }

          const newWallpaperImage = `APOD ${wallpaperUrl} ${date as string}`;

          if (newWallpaperImage !== wallpaperImage) {
            setWallpaper(newWallpaperImage, newWallpaperFit);
            setTimeout(loadWallpaper, MILLISECONDS_IN_DAY);
          }
        }
      }
    } else if (await exists(wallpaperImage)) {
      wallpaperUrl = bufferToUrl(await readFile(wallpaperImage));
    }

    if (wallpaperUrl) {
      const wallpaperStyle = (url: string): string => `
        background-image: url(${url});
        ${cssFit[newWallpaperFit]}
      `;

      desktopRef.current?.setAttribute("style", wallpaperStyle(wallpaperUrl));

      if (fallbackBackground) {
        const img = document.createElement("img");

        img.addEventListener("error", () =>
          desktopRef.current?.setAttribute(
            "style",
            wallpaperStyle(fallbackBackground)
          )
        );
        img.src = wallpaperUrl;
      }
    } else {
      loadWallpaper();
    }
  }, [
    desktopRef,
    exists,
    loadWallpaper,
    readFile,
    setWallpaper,
    vantaConfig,
    wallpaperFit,
    wallpaperImage,
    wallpaperName,
  ]);

  useEffect(() => {
    if (sessionLoaded) {
      if (
        wallpaperName &&
        !Object.keys(WALLPAPER_WORKERS).includes(wallpaperName)
      ) {
        loadFileWallpaper().catch(loadWallpaper);
      } else {
        loadWallpaper();
      }
    }
  }, [loadFileWallpaper, loadWallpaper, sessionLoaded, wallpaperName]);
};

export default useWallpaper;
