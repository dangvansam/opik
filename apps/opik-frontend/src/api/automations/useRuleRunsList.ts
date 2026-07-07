import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, {
  AUTOMATIONS_KEY,
  AUTOMATIONS_REST_ENDPOINT,
  QueryConfig,
} from "@/api/api";

export interface OnlineEvaluationRun {
  trace_id: string;
  trace_name: string;
  input: string;
  output: string;
  trace_start_time: string;
  score_name: string;
  score_value: number;
  score_reason: string;
  scored_at: string;
}

type UseRuleRunsListParams = {
  ruleId: string;
  page: number;
  size: number;
};

export type UseRuleRunsListResponse = {
  content: OnlineEvaluationRun[];
  total: number;
  page: number;
  size: number;
};

const RULE_RUNS_KEY = "rule-runs";

const getRuleRunsList = async (
  { signal }: QueryFunctionContext,
  { ruleId, page, size }: UseRuleRunsListParams,
) => {
  const { data } = await api.get<UseRuleRunsListResponse>(
    `${AUTOMATIONS_REST_ENDPOINT}evaluators/${ruleId}/runs`,
    {
      signal,
      params: {
        page,
        size,
      },
    },
  );

  return data;
};

export default function useRuleRunsList(
  params: UseRuleRunsListParams,
  options?: QueryConfig<UseRuleRunsListResponse>,
) {
  return useQuery({
    queryKey: [AUTOMATIONS_KEY, { sub: RULE_RUNS_KEY, ...params }],
    queryFn: (context) => getRuleRunsList(context, params),
    ...options,
  });
}
