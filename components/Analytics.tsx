import Script from "next/script";

/**
 * 網站訪問統計腳本。
 * 通過環境變量配置，未設置時不會渲染任何腳本。
 *
 *  - Google Analytics 4:  NEXT_PUBLIC_GA_MEASUREMENT_ID
 *  - Umami:               NEXT_PUBLIC_UMAMI_WEBSITE_ID
 *                        (可選) NEXT_PUBLIC_UMAMI_SCRIPT_URL,默認 https://umami.is/script.js
 *  - Plausible:           NEXT_PUBLIC_PLAUSIBLE_DOMAIN
 *                        (可選) NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL,默認 https://plausible.io/js/script.js
 */
export function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const umamiSrc =
    process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ?? "https://umami.is/script.js";
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const plausibleSrc =
    process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL ??
    "https://plausible.io/js/script.js";

  return (
    <>
      {gaId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', { send_page_view: true });
            `}
          </Script>
        </>
      ) : null}

      {umamiId ? (
        <Script
          src={umamiSrc}
          data-website-id={umamiId}
          strategy="afterInteractive"
        />
      ) : null}

      {plausibleDomain ? (
        <Script
          src={plausibleSrc}
          data-domain={plausibleDomain}
          strategy="afterInteractive"
        />
      ) : null}
    </>
  );
}
