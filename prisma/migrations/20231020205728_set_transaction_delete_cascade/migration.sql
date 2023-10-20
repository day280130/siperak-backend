-- DropForeignKey
ALTER TABLE `products_on_transactions` DROP FOREIGN KEY `products_on_transactions_transaction_id_fkey`;

-- AddForeignKey
ALTER TABLE `products_on_transactions` ADD CONSTRAINT `products_on_transactions_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `transaction`(`transaction_id`) ON DELETE CASCADE ON UPDATE CASCADE;
