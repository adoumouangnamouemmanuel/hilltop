// The unit tests use the shared demo data as the marketplace's listings and sellers.
import { listings, sellers } from "@hilltop/shared/seed";
import { setMarket } from "@/lib/market";

setMarket({ listings, sellers, loadedAt: 1 });
