import { Controller, Get, Param, Query, NotFoundException, BadRequestException } from '@nestjs/common';
import { TokensService, SortOption, StatusFilter } from './tokens.service';
import { isValidEvmAddress } from '../common/utils';

@Controller('tokens')
export class TokensController {
  constructor(private tokensService: TokensService) {}

  /**
   * GET /tokens
   * Query params:
   *   sort=newest|market_cap|volume (default: newest)
   *   status=active|graduated|all   (default: active)
   *   limit=20  (max 100)
   *   offset=0
   *   search=keyword (fuzzy match on name/symbol)
   */
  @Get()
  async listTokens(
    @Query('sort') sort?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
  ) {
    const validSorts: SortOption[] = ['newest', 'market_cap', 'volume'];
    const validStatuses: StatusFilter[] = ['active', 'graduated', 'all'];

    const sortOption = validSorts.includes(sort as SortOption)
      ? (sort as SortOption)
      : 'newest';
    const statusOption = validStatuses.includes(status as StatusFilter)
      ? (status as StatusFilter)
      : 'active';

    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    if (isNaN(limitNum) || limitNum < 1) throw new BadRequestException('Invalid limit');
    if (isNaN(offsetNum) || offsetNum < 0) throw new BadRequestException('Invalid offset');

    // Cap search length to prevent expensive ILIKE queries
    const trimmedSearch = search ? search.trim().slice(0, 100) : undefined;

    return this.tokensService.listTokens({
      sort: sortOption,
      status: statusOption,
      limit: limitNum,
      offset: offsetNum,
      search: trimmedSearch,
    });
  }

  /**
   * GET /tokens/stats
   * Global platform stats: total tokens, active, graduated, 24h volume.
   * Cached for 30s.
   */
  @Get('stats')
  async getStats() {
    return this.tokensService.getPlatformStats();
  }

  /**
   * GET /tokens/:address
   * Returns a single token by its contract address.
   */
  @Get(':address')
  async getToken(@Param('address') address: string) {
    if (!isValidEvmAddress(address)) {
      throw new BadRequestException('Invalid token address');
    }
    const token = await this.tokensService.getTokenByAddress(address);
    if (!token) throw new NotFoundException('Token not found');
    return token;
  }

  /**
   * GET /tokens/:address/trades
   * Returns paginated trades for a token (for chart + transaction list).
   * Query params:
   *   limit=50  (max 500)
   *   offset=0
   *   order=desc|asc (default: desc — newest first)
   */
  @Get(':address/trades')
  async getTokenTrades(
    @Param('address') address: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('order') order?: string,
  ) {
    if (!isValidEvmAddress(address)) {
      throw new BadRequestException('Invalid token address');
    }
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    const orderOption = order === 'asc' ? 'asc' : 'desc';

    if (isNaN(limitNum) || limitNum < 1) throw new BadRequestException('Invalid limit');
    if (isNaN(offsetNum) || offsetNum < 0) throw new BadRequestException('Invalid offset');

    return this.tokensService.getTokenTrades(address, {
      limit: limitNum,
      offset: offsetNum,
      order: orderOption as 'asc' | 'desc',
    });
  }

  /**
   * GET /tokens/:address/holders
   * Returns top holders of a token (computed from trades + AMM swaps).
   * Query params:
   *   limit=20  (max 100)
   */
  @Get(':address/holders')
  async getTokenHolders(
    @Param('address') address: string,
    @Query('limit') limit?: string,
  ) {
    if (!isValidEvmAddress(address)) {
      throw new BadRequestException('Invalid token address');
    }
    const limitNum = limit ? parseInt(limit, 10) : 20;
    if (isNaN(limitNum) || limitNum < 1) throw new BadRequestException('Invalid limit');
    return this.tokensService.getTokenHolders(address, { limit: limitNum });
  }
}
