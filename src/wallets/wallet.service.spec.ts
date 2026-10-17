import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletSuccessorErrorCode } from './domain/wallet.model';

describe('WalletService.registerWallet', () => {
  const ownerId = 'owner-1';
  const actorId = 'actor-1';
  const correlationId = 'corr-123';
  const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

  const buildService = (prisma: any) =>
    new WalletService(prisma as any);

  const basePrisma = (overrides: Record<string, any> = {}) => ({
    wallet: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'w1', address }),
      ...(overrides.wallet ?? {}),
    },
    ...overrides,
  });

  const p2002 = (target: string[]) =>
    Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target },
    });

  it('maps a P2002 on the address column to WALLET_ADDRESS_ALREADY_EXISTS', async () => {
    const prisma = basePrisma({
      wallet: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(p2002(['address'])),
      },
    });
    const service = buildService(prisma);

    await expect(
      service.registerWallet({ ownerId, actorId, address, correlationId } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.registerWallet({ ownerId, actorId, address, correlationId } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: WalletSuccessorErrorCode.WALLET_ADDRESS_ALREADY_EXISTS,
        correlationId,
      }),
    });
  });

  it('does not map a P2002 on a non-address column to WALLET_ADDRESS_ALREADY_EXISTS', async () => {
    const prisma = basePrisma({
      wallet: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(p2002(['ownerId'])),
      },
    });
    const service = buildService(prisma);

    await expect(
      service.registerWallet({ ownerId, actorId, address, correlationId } as any),
    ).rejects.not.toMatchObject({
      response: expect.objectContaining({
        code: WalletSuccessorErrorCode.WALLET_ADDRESS_ALREADY_EXISTS,
      }),
    });
  });

  it('maps a dependency outage to ServiceUnavailableException with DEPENDENCY_UNAVAILABLE', async () => {
    const prisma = basePrisma({
      wallet: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('connect ECONNREFUSED'), {
              code: 'ECONNREFUSED',
            }),
          ),
      },
    });
    const service = buildService(prisma);

    await expect(
      service.registerWallet({ ownerId, actorId, address, correlationId } as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    await expect(
      service.registerWallet({ ownerId, actorId, address, correlationId } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: WalletSuccessorErrorCode.DEPENDENCY_UNAVAILABLE,
      }),
    });
  });

  it('rejects a non-owner actor with ForbiddenException and NOT_AUTHORIZED', async () => {
    const prisma = basePrisma();
    const service = buildService(prisma);

    await expect(
      service.registerWallet({
        ownerId,
        actorId: 'someone-else',
        address,
        correlationId,
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.registerWallet({
        ownerId,
        actorId: 'someone-else',
        address,
        correlationId,
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: WalletSuccessorErrorCode.NOT_AUTHORIZED,
      }),
    });
  });
});
