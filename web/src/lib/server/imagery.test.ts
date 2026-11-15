import { describe, expect, it } from "vitest";

import { chooseImagery, offlineGuess, parseRanges } from "./imagery";

const XML = `
<Layer><ows:Identifier>VIIRS_SNPP_CorrectedReflectance_TrueColor</ows:Identifier>
<Dimension><Value>2015-11-24/2022-07-27/P1D</Value><Value>2022-08-10/2026-11-02/P1D</Value></Dimension></Layer>
<Layer><ows:Identifier>VIIRS_NOAA20_CorrectedReflectance_TrueColor</ows:Identifier>
<Dimension><Value>2018-01-05/2026-11-14/P1D</Value></Dimension></Layer>
<Layer><ows:Identifier>MODIS_Terra_CorrectedReflectance_TrueColor</ows:Identifier>
<Dimension><Value>2000-02-24/2026-11-15/P1D</Value></Dimension></Layer>`;

describe("imagerie du jour", () => {
  const ranges = parseRanges(XML);

  it("lit les intervalles de chaque couche", () => {
    expect(ranges.get("VIIRS_SNPP_CorrectedReflectance_TrueColor")).toEqual([
      ["2015-11-24", "2022-07-27"],
      ["2022-08-10", "2026-11-02"],
    ]);
    expect(ranges.has("VIIRS_NOAA21_CorrectedReflectance_TrueColor")).toBe(false);
  });

  it("prefere Suomi-NPP quand il couvre le jour", () => {
    expect(chooseImagery("2025-08-15", ranges)).toMatchObject({ layer: "VIIRS_SNPP_CorrectedReflectance_TrueColor", date: "2025-08-15", shifted: false });
  });

  it("passe a NOAA-20 dans un trou de Suomi-NPP", () => {
    expect(chooseImagery("2022-08-01", ranges)).toMatchObject({ layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", sensor: "VIIRS NOAA-20" });
  });

  it("utilise MODIS Terra avant l'imagerie VIIRS", () => {
    expect(chooseImagery("2008-07-01", ranges)).toMatchObject({ layer: "MODIS_Terra_CorrectedReflectance_TrueColor", date: "2008-07-01" });
  });

  it("prend la derniere image publiee si le jour n'est pas encore disponible", () => {
    expect(chooseImagery("2026-11-20", ranges)).toMatchObject({ date: "2026-11-15", shifted: true });
  });

  it("estime sans reseau", () => {
    expect(offlineGuess("2024-01-01").layer).toBe("VIIRS_NOAA20_CorrectedReflectance_TrueColor");
    expect(offlineGuess("2010-01-01").layer).toBe("MODIS_Terra_CorrectedReflectance_TrueColor");
  });
});
