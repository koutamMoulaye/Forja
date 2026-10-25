import type { Metadata } from "next";
import { ProjectList } from "@/components/session/project-list";

export const metadata: Metadata = { title: "Projets" };

export default function ProjectsPage() {
  return <ProjectList />;
}
