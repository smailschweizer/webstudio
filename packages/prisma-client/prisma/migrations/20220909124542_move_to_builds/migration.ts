import { PrismaClient, Prisma } from "./client";
import { v4 as uuid } from "uuid";
import { z } from "zod";

const TreeHistorySchema = z.array(z.string());

const PageSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  title: z.string(),
  meta: z.record(z.string(), z.string()),
  treeId: z.string(),
});

const PagesSchema = z.object({
  homePage: PageSchema,
  pages: z.array(PageSchema),
});

export default () => {
  const client = new PrismaClient();
  return client.$transaction(async (prisma) => {
    const trees = await prisma.tree.findMany();
    const projects = await prisma.project.findMany();

    const builds: Prisma.BuildCreateManyInput[] = [];

    for (const tree of trees) {
      const project = projects.find(
        (project) =>
          project.devTreeId === tree.id ||
          project.prodTreeId === tree.id ||
          TreeHistorySchema.parse(project.prodTreeIdHistory).includes(tree.id)
      );

      if (project === undefined) {
        continue;
      }

      const pages = PagesSchema.parse({
        homePage: {
          id: uuid(),
          name: "Home",
          path: "",
          title: "Home",
          meta: {},
          treeId: tree.id,
        },
        pages: [],
      });

      builds.push({
        pages: JSON.stringify(pages),
        isDev: project.devTreeId === tree.id,
        isProd: project.prodTreeId === tree.id,
        projectId: project.id,
      });
    }

    await prisma.build.createMany({ data: builds });
  });
};
