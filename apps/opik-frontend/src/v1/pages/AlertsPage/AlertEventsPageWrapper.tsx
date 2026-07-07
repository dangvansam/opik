import React from "react";
import { useParams } from "@tanstack/react-router";
import AlertEventsPage from "@/v1/pages/AlertsPage/AlertEventsPage";

const AlertEventsPageWrapper: React.FunctionComponent = () => {
  const { alertId } = useParams({ strict: false }) as { alertId: string };

  return <AlertEventsPage alertId={alertId} />;
};

export default AlertEventsPageWrapper;
