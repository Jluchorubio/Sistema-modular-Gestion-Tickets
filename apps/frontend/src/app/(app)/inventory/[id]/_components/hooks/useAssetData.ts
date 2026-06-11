import { useQuery } from "@tanstack/react-query";
import {
  inventoryService,
  type AssetDetail,
  type AssetAssignment,
  type AssetHistoryEntry,
  type AssetTicket,
  type AssetChild,
  type AssetImage,
} from "@/services/inventory.service";
import { ticketsService } from "@/services/tickets.service";

export function useAssetData(assetId: string, moduleId: string, editing: boolean) {
  const asset = useQuery<AssetDetail>({
    queryKey: ["asset-detail", assetId],
    queryFn:  () => inventoryService.getOne(assetId),
    staleTime: 30_000,
  });

  const assignments = useQuery<AssetAssignment[]>({
    queryKey: ["asset-assignments", assetId],
    queryFn:  () => inventoryService.getActiveAssignments(assetId),
    staleTime: 30_000,
  });

  const assetTickets = useQuery<AssetTicket[]>({
    queryKey: ["asset-tickets", assetId],
    queryFn:  () => inventoryService.getAssetTickets(assetId),
    staleTime: 60_000,
  });

  const history = useQuery<AssetHistoryEntry[]>({
    queryKey: ["asset-history", assetId],
    queryFn:  () => inventoryService.getHistory(assetId),
    staleTime: 30_000,
  });

  const images = useQuery<AssetImage[]>({
    queryKey: ["asset-images", assetId],
    queryFn:  () => inventoryService.getAssetImages(assetId),
    staleTime: 60_000,
  });

  const children = useQuery<AssetChild[]>({
    queryKey: ["asset-children", assetId],
    queryFn:  () => inventoryService.getChildAssets(assetId),
    staleTime: 60_000,
  });

  const categories = useQuery({
    queryKey: ["ticket-categories", moduleId],
    queryFn:  () => ticketsService.getCategories(moduleId),
    staleTime: 5 * 60_000,
    enabled:   editing && !!moduleId,
  });

  const environments = useQuery({
    queryKey: ["ticket-environments", moduleId],
    queryFn:  () => ticketsService.getEnvironments(moduleId),
    staleTime: 5 * 60_000,
    enabled:   editing && !!moduleId,
  });

  return {
    asset:        asset.data,
    isLoading:    asset.isLoading,
    assignments:  assignments.data ?? [],
    assignment:   (assignments.data ?? [])[0] ?? null,
    assetTickets: assetTickets.data ?? [],
    history:      history.data ?? [],
    images:       images.data ?? [],
    children:     children.data ?? [],
    categories:   categories.data ?? [],
    environments: environments.data ?? [],
  };
}
