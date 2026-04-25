import dynamic from "next/dynamic";

const TasksDashboard = dynamic(() => import("@/components/tasks-dashboard").then(m => m.TasksDashboard));

export default function TasksPage() {
  // No overflow-x:hidden wrapper here — Card uses `ring-1` which sits 1px
  // outside the box and gets clipped by overflow-hidden when a card sits at
  // the page edge (the Today/Scheduled-earlier cards in this section's
  // single-column layout). The shell-main already clips horizontal overflow.
  return <TasksDashboard />;
}
