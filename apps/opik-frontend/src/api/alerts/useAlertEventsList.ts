import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, { ALERTS_KEY, ALERTS_REST_ENDPOINT, QueryConfig } from "@/api/api";
import { WebhookDeliveryLogPage } from "@/types/alerts";

type UseAlertEventsListParams = {
  alertId: string;
  page: number;
  size: number;
};

const ALERT_EVENTS_KEY = "alert-events";

const getAlertEventsList = async (
  { signal }: QueryFunctionContext,
  { alertId, page, size }: UseAlertEventsListParams,
) => {
  const { data } = await api.get<WebhookDeliveryLogPage>(
    `${ALERTS_REST_ENDPOINT}${alertId}/events`,
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

export default function useAlertEventsList(
  params: UseAlertEventsListParams,
  options?: QueryConfig<WebhookDeliveryLogPage>,
) {
  return useQuery({
    queryKey: [ALERTS_KEY, { sub: ALERT_EVENTS_KEY, ...params }],
    queryFn: (context) => getAlertEventsList(context, params),
    ...options,
  });
}
