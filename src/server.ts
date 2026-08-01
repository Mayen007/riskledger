import "dotenv/config";

import { run } from "probot";

import registerApp from "./app";

run(registerApp);