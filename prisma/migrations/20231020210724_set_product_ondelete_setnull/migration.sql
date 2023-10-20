-- DropForeignKey
ALTER TABLE `products_on_transactions` DROP FOREIGN KEY `products_on_transactions_product_code_fkey`;

-- AlterTable
ALTER TABLE `products_on_transactions` MODIFY `product_code` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `products_on_transactions` ADD CONSTRAINT `products_on_transactions_product_code_fkey` FOREIGN KEY (`product_code`) REFERENCES `product`(`product_code`) ON DELETE SET NULL ON UPDATE CASCADE;
