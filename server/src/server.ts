import express, { type Express } from "express";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import inventoryRouter from "./routes/inventory.js";
import setsRouter from "./routes/sets.js";
import bagsRouter from "./routes/bags.js";
import scanRouter from "./routes/scan.js";
import mocsRouter from "./routes/mocs.js";
import rebuildsRouter from "./routes/rebuilds.js";
import sharingRouter from "./routes/sharing.js";
import sharedRouter from "./routes/shared.js";
import searchRouter from "./routes/search.js";
import displayIdeasRouter from "./routes/displayIdeas.js";
import adminRouter from "./routes/admin.js";
import marketplaceRouter from "./routes/marketplace.js";

const app: Express = express();
const port = Number(process.env["PORT"] ?? 8080);

app.use(express.json({ limit: "10mb" }));
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/sets", setsRouter);
app.use("/api/bags", bagsRouter);
app.use("/api/scan", scanRouter);
app.use("/api/mocs", mocsRouter);
app.use("/api/rebuilds", rebuildsRouter);
app.use("/api/sharing", sharingRouter);
app.use("/api/shared", sharedRouter);
app.use("/api/search", searchRouter);
app.use("/api/display-ideas", displayIdeasRouter);
app.use("/api/admin", adminRouter);
app.use("/api/marketplace", marketplaceRouter);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

export default app;
