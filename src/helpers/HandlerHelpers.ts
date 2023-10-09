import { ParamsDictionary, RequestHandler } from "express-serve-static-core";
import { ZodIssue } from "zod";

export type ErrorResponse = {
  status: "error";
  message: string;
};

export type SuccessResponse = {
  status: "success";
  message: string;
  datas?: unknown;
};

export type ReqHandler = RequestHandler<ParamsDictionary, ErrorResponse | SuccessResponse>;

export const logError = (location: string, error: unknown, known: boolean | "unset" = "unset") => {
  const time = new Date().toISOString();
  console.log(
    `❗ Error : ${time}@${location}[${known !== "unset" ? (known ? "known" : "unknown") : known}] : ${error}`
  );
};

export const serializeZodIssues = (issues: ZodIssue[], message: string) => {
  return `${message}>${issues.map(issue => issue.message).join("|")}`;
};

export const snakeToCamel = (val: string) => {
  const valArr = val.split("_");
  for (let i = 1; i < valArr.length; i++) {
    const wordArr = valArr[i].split("");
    wordArr[0] = valArr[i].charAt(0).toUpperCase();
    valArr[i] = wordArr.join("");
  }
  return valArr.join("");
};
