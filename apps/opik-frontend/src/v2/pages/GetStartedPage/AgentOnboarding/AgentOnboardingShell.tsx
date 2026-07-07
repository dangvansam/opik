import React from "react";

const AgentOnboardingShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="fixed inset-0 z-50 overflow-auto bg-soft-background">
    {children}
  </div>
);

export default AgentOnboardingShell;
