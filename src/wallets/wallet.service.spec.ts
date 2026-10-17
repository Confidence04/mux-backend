import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, Logger } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletSuccessorErrorCode } from './wallet-successor.error-code';

describe('WalletService', () => {
  let service: WalletService;

  const prismaMock = {
    wallet: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  describe('redactAddress', () => {
    const fullAddress =
      'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

    it('never returns the full address for a realistic Stellar address', () => {
      const redacted = (service as any).redactAddress(fullAddress);

      expect(redacted).not.toContain(fullAddress);
      expect(redacted).not.toBe(fullAddress);
      expect(redacted.length).toBeLessThan(fullAddress.length);
    });

    it('returns a safe value for an empty string without throwing', () => {
      expect(() => (service as any).redactAddress('')).not.toThrow();
      const redacted = (service as any).redactAddress('');
      expect(typeof redacted).toBe('string');
      expect(redacted).not.toBe('');
    });

    it('returns a safe value for a short string without throwing', () => {
      expect(() => (service as any).redactAddress('abc')).not.toThrow();
      const redacted = (service as any).redactAddress('abc');
      expect(typeof redacted).toBe('string');
      expect(redacted).not.toBe('abc');
    });
  });

  describe('registration logging', () => {
    const fullAddress =
      'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

    it('logs the redacted form and not the raw address on success', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      prismaMock.wallet.findUnique.mockResolvedValue(null);
      prismaMock.wallet.create.mockResolvedValue({
        id: 'wallet-1',
        address: fullAddress,
      });

      await service.registerWallet(fullAddress);

      const redacted = (service as any).redactAddress(fullAddress);
      const loggedMessages = logSpy.mock.calls
        .map((call) => call.map((arg) => String(arg)).join(' '))
        .join('\n');

      expect(loggedMessages).toContain(redacted);
      expect(loggedMessages).not.toContain(fullAddress);

      logSpy.mockRestore();
    });
  });

  describe('registerWallet address validation', () => {
    const validAddress =
      'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
    // Same address with a corrupted trailing checksum character.
    const corruptedChecksumAddress =
      'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2X';

    const expectInvalidAddress = async (address: string) => {
      await expect(service.registerWallet(address)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.registerWallet(address)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: WalletSuccessorErrorCode.WALLET_ADDRESS_INVALID,
        }),
      });
      expect(prismaMock.wallet.create).not.toHaveBeenCalled();
    };

    it('accepts a valid Stellar address and proceeds to create', async () => {
      prismaMock.wallet.findUnique.mockResolvedValue(null);
      prismaMock.wallet.create.mockResolvedValue({
        id: 'wallet-1',
        address: validAddress,
      });

      await expect(service.registerWallet(validAddress)).resolves.toBeDefined();
      expect(prismaMock.wallet.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an address with a corrupted checksum', async () => {
      await expectInvalidAddress(corruptedChecksumAddress);
    });

    it('rejects an empty string', async () => {
      await expectInvalidAddress('');
    });

    it('rejects a non-Stellar string', async () => {
      await expectInvalidAddress('not-a-stellar-address');
    });
  });
});
