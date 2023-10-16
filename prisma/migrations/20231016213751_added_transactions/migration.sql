/*
  Warnings:

  - The primary key for the `product` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE `product` DROP PRIMARY KEY,
    ADD PRIMARY KEY (`product_code`);

-- CreateTable
CREATE TABLE `transaction` (
    `transaction_id` VARCHAR(191) NOT NULL,
    `tax_invoice_number` VARCHAR(19) NOT NULL,
    `customer_name` VARCHAR(64) NOT NULL,
    `customer_address` VARCHAR(255) NOT NULL,
    `customer_npwp_number` VARCHAR(20) NOT NULL,
    `total` INTEGER NOT NULL,
    `tax` INTEGER NOT NULL,
    `dpp` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`transaction_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products_on_transactions` (
    `rel_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `product_code` VARCHAR(191) NOT NULL,
    `transaction_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_on_transactions_product_code_transaction_id_key`(`product_code`, `transaction_id`),
    PRIMARY KEY (`rel_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `products_on_transactions` ADD CONSTRAINT `products_on_transactions_product_code_fkey` FOREIGN KEY (`product_code`) REFERENCES `product`(`product_code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products_on_transactions` ADD CONSTRAINT `products_on_transactions_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `transaction`(`transaction_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
