export * from "./mock/adapter";
export * from "./skeleton";
export * from "./astree/adapter";
export * from "./astree/parser";
export * from "./newttplay/adapter";
export * from "./newttplay/parser";
export * from "./ttadivision/adapter";
export * from "./ttadivision/parser";
export * from "./airping/adapter";
export * from "./airping/parser";
export * from "./okpingpong/adapter";
export * from "./okpingpong/parser";
export * from "./mytt/adapter";
export * from "./mytt/parser";
export * from "./superstar/adapter";
export * from "./superstar/parser";
export * from "./yongintt/adapter";
export * from "./yongintt/parser";
export * from "./iping/adapter";
export * from "./iping/encoding";
export * from "./iping/parser";
export * from "./iping/session";
export * from "./resilient-fetch";

import { DisabledSourceAdapter } from "./skeleton";
import { AstreeSourceAdapter } from "./astree/adapter";
import { NewttplaySourceAdapter } from "./newttplay/adapter";
import { TtaDivisionSourceAdapter } from "./ttadivision/adapter";
import { AirpingSourceAdapter } from "./airping/adapter";
import { OkPingpongSourceAdapter } from "./okpingpong/adapter";
import { MyttSourceAdapter } from "./mytt/adapter";
import { SuperstarSourceAdapter } from "./superstar/adapter";
import { YonginTtSourceAdapter } from "./yongintt/adapter";
import { IpingSourceAdapter } from "./iping/adapter";
export const airpingAdapter = new AirpingSourceAdapter(
  process.env.CRAWLER_SOURCE_AIRPING_ENABLED === "true",
);
export const astreeAdapter = new AstreeSourceAdapter(
  process.env.CRAWLER_SOURCE_ASTREE_ENABLED === "true",
);
export const newttplayAdapter = new NewttplaySourceAdapter(
  process.env.CRAWLER_SOURCE_NEWTTPLAY_ENABLED === "true",
);
export const ttaDivisionAdapter = new TtaDivisionSourceAdapter(
  process.env.CRAWLER_SOURCE_TTADIVISION_ENABLED === "true",
);
export const okpingpongAdapter = new OkPingpongSourceAdapter(
  process.env.CRAWLER_SOURCE_OKPINGPONG_ENABLED === "true",
);
export const myttAdapter = new MyttSourceAdapter(
  process.env.CRAWLER_SOURCE_MYTT_ENABLED === "true",
);
export const superstarAdapter = new SuperstarSourceAdapter(
  process.env.CRAWLER_SOURCE_SUPERSTAR_ENABLED === "true",
);
export const yonginTtAdapter = new YonginTtSourceAdapter(
  process.env.CRAWLER_SOURCE_YONGINTT_ENABLED === "true",
  process.env.KAKAO_REST_API_KEY,
);
export const ipingAdapter = new IpingSourceAdapter(
  process.env.CRAWLER_SOURCE_IPING_ENABLED === "true",
  process.env.IPING_USERNAME && process.env.IPING_PASSWORD
    ? {
        username: process.env.IPING_USERNAME,
        password: process.env.IPING_PASSWORD,
      }
    : undefined,
);
export const bandAdapter = new DisabledSourceAdapter("band", "manual");
